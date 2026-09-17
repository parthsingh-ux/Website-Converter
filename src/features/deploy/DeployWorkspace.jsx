'use client';
import HeaderFooterMode from '../converter/HeaderFooterMode';
import WordPressConnection from '../converter/WordPressConnection';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import TextField from '@/components/InputAndTextField';
import {
  FolderOpen,
  Upload,
  ArrowUpRight,
  CheckCircle2,
  Globe,
  Sparkles,
  Layers,
  RefreshCw,
  FileText,
  ExternalLink,
  ShieldCheck,
  Layout,
  Image as ImageIcon,
  AlertCircle,
  Play
} from 'lucide-react';
import { useStudioSession, useConnectionBusy } from '../converter/StudioSession';
import batch from '../converter/batch-utils.cjs';
import media from '../converter/media-queue.cjs';
import { detectFavicon, prepareFavicon } from './favicon-utils';
import styles from '../converter/converter.module.css';

const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `deploy-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export default function DeployWorkspace({ editor: initialEditor = 'gutenberg', onBusyChange = () => {} }) {
  const [editor,setEditor]=useState(initialEditor);
  const {requestHeaders,destinationId} = useStudioSession();

  // State
  const [rows, setRows] = useState([]);
  const [source, setSource] = useState({ files: {}, images: [] });
  const [detectedFavicon, setDetectedFavicon] = useState(null);
  const [customFavicon, setCustomFavicon] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [siteKey, setSiteKey] = useState('default');
  const [edition, setEdition] = useState('free');
  const [status, setStatus] = useState('publish');
  const [policy, setPolicy] = useState('replace');
  const [shared, setShared] = useState(true);
  const [connection, setConnection] = useState(null);
  const [headerSelector, setHeaderSelector] = useState('');
  const [footerSelector, setFooterSelector] = useState('');
  const [globalsPage, setGlobalsPage] = useState('');

  // Deployment completion state
  const [isCompleted, setIsCompleted] = useState(false);
  const [liveSiteUrl, setLiveSiteUrl] = useState('');
  const [deployedPages, setDeployedPages] = useState([]);
  const [favUpdated, setFavUpdated] = useState(false);
  const [homepageSet, setHomepageSet] = useState(false);
  const [homepagePath,setHomepagePath]=useState('');
  const [warnings,setWarnings]=useState([]);

  const stop = useRef(false);
  const receipts = useRef({});

  useConnectionBusy(busy);
  useEffect(()=>{setConnection(null);receipts.current={};setIsCompleted(false);setLiveSiteUrl('');setDeployedPages([]);setFavUpdated(false);setHomepageSet(false);setRows(old=>old.map(r=>({...r,pageId:'',status:'pending',result:null,error:'',operationId:newId()})));},[destinationId]);

  useEffect(() => {
    return () => {
      stop.current = true;
    };
  }, []);

  const patch = (key, values) =>
    setRows((old) => old.map((r) => (r.key === key ? { ...r, ...values } : r)));

  async function api(path, body) {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...requestHeaders,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  async function run(label, fn) {
    setBusy(label);
    onBusyChange(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
      onBusyChange('');
    }
  }

  // Load uploaded files & auto-detect favicon & homepage
  async function loadFiles(selected, isFolder) {
    await run('Reading site files...', async () => {
      setIsCompleted(false);
      setLiveSiteUrl('');
      setFavUpdated(false);
      setHomepageSet(false);

      const files = Array.from(selected);
      if (
        files
          .filter((f) => /\.(html?|css|js|json)$/i.test(f.name))
          .reduce((n, f) => n + f.size, 0) >
        22 * 1024 * 1024
      ) {
        throw new Error('Text source files exceed 22 MB limit.');
      }

      const map = {};
      const images = [];
      const json = [];
      const prefix = isFolder ? files[0]?.webkitRelativePath.split('/')[0] + '/' : '';

      for (const file of files) {
        const path = isFolder ? file.webkitRelativePath.slice(prefix.length) : file.name;
        if (/\.(html?|css|js)$/i.test(path)) {
          if (map[path]) throw new Error(`Duplicate filename: ${path}. Use folder upload.`);
          map[path] = await file.text();
        } else if (/\.json$/i.test(path)) {
          json.push({ path, data: JSON.parse(await file.text()) });
        } else if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i.test(path)) {
          images.push({ filename: path, file, size: file.size, name: file.name });
        }
      }

      const pages = Object.keys(map)
        .filter((p) => /\.html?$/i.test(p))
        .map((path) => {
          const doc = new DOMParser().parseFromString(map[path], 'text/html');
          const title =
            doc.querySelector('title')?.textContent.trim() ||
            doc.querySelector('h1')?.textContent.trim() ||
            batch.titleFromPath(path);
          const isHome = /(^|\/)index\.html?$/i.test(path);
          return {
            key: path,
            path,
            title,
            slug: isHome ? '' : '',
            pageId: '',
            selected: true,
            status: 'pending',
            isHomepage: isHome,
            operationId: newId(),
          };
        });

      if (!pages.length) {
        for (const item of json) {
          const value = await api('/api/wordpress/normalize', {
            bundle: item.data,
            editor,
            siteKey,
          });
          const isHome = /(^|\/)index\.html?$/i.test(item.path);
          pages.push({
            key: item.path,
            path: value.sourcePath || item.path.replace(/\.json$/i, '.html'),
            title: value.title || batch.titleFromPath(item.path),
            slug: '',
            pageId: '',
            selected: true,
            status: 'pending',
            isHomepage: isHome,
            operationId: newId(),
            bundle: value,
          });
        }
      }

      if (!pages.length) throw new Error('No HTML pages found in uploaded files.');

      // Sort index.html to top
      pages.sort(
        (a, b) =>
          Number(!/(^|\/)index\.html?$/i.test(a.path)) -
            Number(!/(^|\/)index\.html?$/i.test(b.path)) ||
          a.path.localeCompare(b.path)
      );

      // Auto-detect favicon
      const detected = detectFavicon(map, images);
      setDetectedFavicon(detected);
      setCustomFavicon(null);

      setSource({ files: map, images });
      setRows(pages);
      setGlobalsPage(pages[0].key);
      const indexes=pages.filter(p=>/(^|\/)index\.html?$/i.test(p.path)).sort((a,b)=>a.path.split('/').length-b.path.split('/').length);
      const home=indexes.length===1||(indexes[0]&&indexes[0].path.split('/').length<indexes[1]?.path.split('/').length)?indexes[0]:null;
      setHomepagePath(home?.path||(pages.length===1?pages[0].path:''));
      receipts.current = {};
    });
  }

  // Connect & Check WordPress Status
  async function connectWP() {
    const c = await api('/api/wordpress/status');
    setConnection(c);
    if (c.url) setLiveSiteUrl(c.url);

    const found = await api(
      `/api/wordpress/pages?editor=${editor}&siteKey=${encodeURIComponent(siteKey)}`
    );
    setRows((old) =>
      old.map((row) => {
        const id =
          found.mappings?.[row.path] ||
          found.pages.find((p) => p.sourcePath === row.path && p.siteKey === siteKey)?.id;
        return id && !row.pageId ? { ...row, pageId: String(id) } : row;
      })
    );
  }

  // Full Automated Deploy & Publish Pipeline
  async function deploySite() {
    stop.current = false;
    setIsCompleted(false);
    setError('');

    if (!rows.length) {
      setError('Please upload site files before deploying.');
      return;
    }

    setWarnings([]);
    if(!rows.some(r=>r.selected))throw Error('Select at least one page.');
    const hasUnsaved=rows.some(r=>r.selected&&r.status!=='saved');
    if(hasUnsaved)batch.validateQueue(rows);
    // Step 1: Verify Connection
    setBusy('Checking WordPress Connection...');
    const bridge = await api('/api/wordpress/status');
    const version = (bridge.version || '0').split('.').map(Number);
    if (!(version[0] > 1 || (version[0] === 1 && version[1] >= 6))) {
      throw new Error(
        'Install Converter Studio Bridge plugin 1.6.0 or newer on target site.'
      );
    }
    if (bridge.url) setLiveSiteUrl(bridge.url);

    // Step 2: Upload & Update Favicon (if present)
    const faviconToUse = customFavicon || detectedFavicon;
    let uploadedFaviconUrl = '';
    if (faviconToUse) {
      setBusy(`Uploading Favicon (${faviconToUse.filename || faviconToUse.name})...`);
      try {
        const prepared=await prepareFavicon(faviconToUse);
        const favUrls = await media.uploadImages([prepared], {
          connection:requestHeaders,
          shouldStop: () => stop.current,
          onProgress: (p) => setBusy(`Favicon upload ${p.percent}%...`),
        });
        const favUrl = favUrls[prepared.filename];
        if (favUrl) {
          uploadedFaviconUrl = favUrl;
          setBusy('Setting WordPress Site Favicon...');
          await api('/api/wordpress/identity', { faviconUrl: favUrl });
          setFavUpdated(true);
        }
      } catch (favErr) {
        setWarnings(old=>[...old,'Favicon: '+favErr.message]);
      }
    }

    // Step 3: Upload All Site Images
    const imageList = [
      ...source.images,
      ...rows.flatMap((r) => (r.bundle ? media.embeddedImages(r.bundle) : [])),
    ];

    let mediaUrls = {};
    if (imageList.length) {
      setBusy(`Uploading ${imageList.length} Site Images...`);
      mediaUrls = await media.uploadImages(imageList, {
        connection:requestHeaders,
        shouldStop: () => stop.current,
        onProgress: (p) =>
          setBusy(`Uploading image ${p.index + 1}/${p.total} · ${p.filename} (${p.percent}%)`),
      });
    }

    // Step 4: Convert & Deploy Pages
    setBusy('Converting and Deploying Pages to WordPress...');
    const ordered = [...rows].sort(
      (a, b) => Number(b.key === globalsPage) - Number(a.key === globalsPage)
    );

    let indexPageResult = null;let didSetHomepage=false;
    const deployedList = rows.filter(r=>r.selected&&receipts.current[r.key]).map(row=>({row,result:receipts.current[row.key]}));
    indexPageResult=deployedList.find(({row})=>row.path===homepagePath)?.result||null;

    if(hasUnsaved)await batch.deployQueue(ordered, {
      convert: async (row) => {
        if (stop.current) throw new Error('Deployment cancelled by user.');
        if (row.bundle) {
          const b = structuredClone(row.bundle);
          b.title = row.title;
          b.siteKey = siteKey;
          b.sourcePath = row.path;
          return await api('/api/wordpress/normalize',{bundle:b,editor,siteKey,sharedParts:shared});
        }

        const converted = await api('/api/convert', {
          editor,
          edition,
          title: row.title,
          siteKey,
          sharedParts: shared,
          headerSelector: headerSelector || undefined,
          footerSelector: footerSelector || undefined,
          sourcePath: row.path,
          files: source.files,
          entry: row.path,
          imageAssets: [],
        });

        for (const [part, bundle] of Object.entries(converted.parts || {})) {
          const missing =
            bundle?.ecb?.unresolvedDependencies ||
            bundle?.manifest?.unresolvedDependencies ||
            [];
          if (missing.length) {
            throw new Error(
              `${part}: Missing source dependencies. Include linked stylesheets/scripts.`
            );
          }
        }
        return converted;
      },

      deploy: async (row, bundle) => {
        if (stop.current) throw new Error('Deployment stopped.');
        const result = await api('/api/wordpress/deploy', {
          bundle: media.deploymentBundle(bundle),
          mediaUrls,
          operationId: row.operationId,
          pageId: row.pageId ? Number(row.pageId) : 0,
          slug: row.slug || undefined,
          status,
          globalPolicy: row.key === globalsPage ? policy : 'keep',
        });

        receipts.current[row.key] = { path: row.path, title: row.title, ...result };
        deployedList.push({ row, result });

        // Save index.html result
        if (row.path===homepagePath) {
          indexPageResult = result;
        }

        return result;
      },
      onChange: patch,
    });

    // Step 5: Automatically set index.html as Homepage
    if (status==='publish' && indexPageResult && indexPageResult.pageId) {
      setBusy('Setting index.html as WordPress Static Homepage...');
      try {
        await api('/api/wordpress/homepage', { pageId: Number(indexPageResult.pageId) });
        setHomepageSet(true);didSetHomepage=true;
      } catch (hpErr) {
        setWarnings(old=>[...old,'Homepage: '+hpErr.message]);
      }
    }

    // Finished successfully
    if(!deployedList.length)throw Error('Select at least one page to deploy.');
    setLiveSiteUrl(didSetHomepage ? (bridge.url||deployedList[0].result.pageUrl) : (indexPageResult?.pageUrl||deployedList[0].result.pageUrl||bridge.url||''));
    setDeployedPages(deployedList);
    setIsCompleted(true);
    setBusy('');
    onBusyChange('');
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const savedCount = rows.filter((r) => r.status === 'saved').length;
  const indexRow = rows.find((r) => /(^|\/)index\.html?$/i.test(r.path));

  return (
    <div className={styles.batchArea}>
      {/* HEADER SECTION */}
      <div className={styles.batchOverview}>
        <div>
          <span className={styles.eyebrow}>AUTOMATED PUBLISHING PIPELINE</span>
          <h2 className="flex items-center gap-2">
            <span>Direct Site Deployment</span>
            <Sparkles className="text-amber-400" size={22} />
          </h2>
          <p>
            Upload static site files or folder. We automatically handle favicon extraction, header & footer matching, image uploads, page conversion, and set index.html as the static homepage.
          </p>
        </div>
        <div className={styles.batchStats}>
          <b>
            {rows.length}
            <small>pages found</small>
          </b>
          <b>
            {source.images.length}
            <small>images queued</small>
          </b>
        </div>
      </div>

      <div className={styles.batchGrid}>
        <div>
          {/* COMPLETED SUCCESS BANNER */}
          {isCompleted && (
            <div className="mb-6 p-6 bg-gradient-to-r from-emerald-950/80 via-emerald-900/60 to-slate-900 border-2 border-emerald-500/60 rounded-2xl shadow-2xl animate-fade-in text-white">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg flex-shrink-0">
                    <CheckCircle2 size={36} />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                      {status==='publish'?'Website published successfully':'Pages saved as drafts'}
                    </h3>
                    <p className="text-sm text-emerald-200/90 mt-1">
                      Selected pages saved, images uploaded
                      {favUpdated ? ', favicon set' : ''}
                      {homepageSet ? ', and homepage assigned' : ''}.
                    </p>
                  </div>
                </div>

                {liveSiteUrl && (
                  <a
                    href={liveSiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3 px-6 rounded-xl flex items-center justify-center gap-2 shadow-xl hover:shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5 text-base border border-emerald-300"
                  >
                    <span>{status==='publish'?'View deployed page':'View saved page'}</span>
                    <ExternalLink size={20} />
                  </a>
                )}
              </div>

              {/* Page Receipts List */}
              {deployedPages.length > 0 && (
                <div className="mt-5 pt-4 border-t border-emerald-800/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {deployedPages.map(({ row, result }) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between bg-emerald-950/50 p-2.5 rounded-lg border border-emerald-800/40"
                    >
                      <span className="truncate font-medium text-emerald-100 pr-2">
                        {row.title} {row.path===homepagePath && '(Homepage)'}
                      </span>
                      {result?.pageUrl && <a href={result.pageUrl} target="_blank" rel="noreferrer">View page ↗</a>}
                      {result?.editUrl && (
                        <a
                          href={result.editUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-300 hover:underline flex items-center gap-1 font-semibold flex-shrink-0"
                        >
                          Edit in WP <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 1: FILE UPLOAD DROPZONE */}
          <Card
            title="1. Static Site Input"
            subtitle="Upload complete folder or files (HTML, CSS, JS, Images, Favicon)."
            textColor="text-layout-foreground"
            className={styles.card}
          >
            <fieldset disabled={!!busy}>
              <div className={styles.dropzone}>
                <FolderOpen size={36} className="text-primary-400" />
                <strong>Select folder or site files</strong>
                <span>Upload site folder to preserve nested paths & linked asset references.</span>
                <div className={styles.toolbar}>
                  <label className={styles.fileButton}>
                    <FolderOpen size={16} /> Select Site Folder
                    <input
                      type="file"
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={(e) => loadFiles(e.target.files, true)}
                    />
                  </label>
                  <label className={styles.fileButton}>
                    <Upload size={16} /> Choose Files
                    <input
                      type="file"
                      multiple
                      accept=".html,.htm,.css,.js,.json,image/*"
                      onChange={(e) => loadFiles(e.target.files, false)}
                    />
                  </label>
                </div>
              </div>
            </fieldset>
          </Card>

          {/* STEP 2: AUTO FAVICON PREVIEW */}
          <Card
            title="2. Automatic Favicon Detection"
            subtitle="Extracted from HTML <link rel='icon'> or site image files (.png, .jpg, .ico, .svg, .webp)."
            textColor="text-layout-foreground"
            className={styles.card}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/60">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary-500/10 border border-primary-500/30 flex items-center justify-center text-primary-400 overflow-hidden">
                  {(customFavicon || detectedFavicon) ? (
                    <img
                      src={URL.createObjectURL(
                        (customFavicon || detectedFavicon).file || (customFavicon || detectedFavicon)
                      )}
                      alt="Favicon Preview"
                      className="w-8 h-8 object-contain"
                    />
                  ) : (
                    <Globe size={24} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-gray-900 dark:text-gray-100">
                      {(customFavicon || detectedFavicon)
                        ? (customFavicon || detectedFavicon).filename ||
                          (customFavicon || detectedFavicon).name
                        : 'No favicon detected yet'}
                    </strong>
                    {(customFavicon || detectedFavicon) && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                        {customFavicon ? 'Custom Override' : 'Auto Detected'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {(customFavicon || detectedFavicon)
                      ? 'Will be uploaded to WordPress & set as browser tab site icon.'
                      : 'Upload files above or select a custom icon image below.'}
                  </p>
                </div>
              </div>

              <label className={styles.fileButton}>
                <Upload size={14} /> Custom Icon
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/x-icon,image/svg+xml"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      setCustomFavicon({
                        name: e.target.files[0].name,
                        filename: e.target.files[0].name,
                        file: e.target.files[0],
                        size: e.target.files[0].size,
                      });
                    }
                  }}
                />
              </label>
            </div>
          </Card>

          {/* STEP 3: PAGES TO DEPLOY & HOMEPAGE IDENTIFIER */}
          <Card
            title="3. Pages & Homepage Configuration"
            subtitle="Confirm the detected homepage or choose another page in Publishing Options."
            textColor="text-layout-foreground"
            className={styles.card}
          >
            {rows.length ? (
              <>
                <div className={styles.queueTools}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!!busy}
                      checked={rows.every((r) => r.selected)}
                      onChange={(e) =>
                        setRows((old) => old.map((r) => ({ ...r, selected: e.target.checked })))
                      }
                    />
                    <span>Select all ({rows.length} pages)</span>
                  </label>
                  <Button
                    size="sm"
                    variant="light"
                    isDisabled={!!busy}
                    onClick={() => run('Matching existing pages...', connectWP)}
                  >
                    <RefreshCw size={14} /> Match existing pages
                  </Button>
                </div>

                <div className={styles.tableScroll}>
                  <table className={styles.queueTable}>
                    <thead>
                      <tr>
                        <th>Use</th>
                        <th>Source Page & Name</th>
                        <th>URL Slug</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <input
                              type="checkbox"
                              disabled={!!busy}
                              checked={row.selected}
                              onChange={(e) => patch(row.key, { selected: e.target.checked })}
                            />
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <input
                                disabled={!!busy || row.status === 'saved'}
                                value={row.title}
                                onChange={(e) =>
                                  setRows((old) =>
                                    old.map((r) =>
                                      r.key === row.key ? { ...r, title: e.target.value } : r
                                    )
                                  )
                                }
                              />
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <small>{row.path}</small>
                              {row.path===homepagePath && (
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <span>Homepage</span>
                                </span>
                              )}
                              {row.key === globalsPage && (
                                <span className={styles.sourcePill}>Shared Header/Footer</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <input
                              disabled={!!busy || row.status === 'saved'}
                              value={row.slug}
                              placeholder={row.isHomepage ? 'front-page' : 'Automatic'}
                              onChange={(e) =>
                                setRows((old) =>
                                  old.map((r) =>
                                    r.key === row.key ? { ...r, slug: e.target.value } : r
                                  )
                                )
                              }
                            />
                          </td>
                          <td>
                            <span className={styles.progressPill} data-state={row.status}>
                              {row.status}
                            </span>
                            {row.error && <p className={styles.rowError}>{row.error}</p>}
                            {row.result && (
                              <a
                                href={row.result.editUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-xs font-semibold text-primary-400 hover:underline mt-1"
                              >
                                Edit ↗
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className={styles.empty}>
                <FileText size={28} />
                <p>Your uploaded static site pages will appear here.</p>
              </div>
            )}
          </Card>
        </div>

        {/* SIDEBAR / CONTROLS COLUMN */}
        <aside className={styles.column}>
          {/* WORDPRESS CONNECTION */}
          <Card
            title="WordPress Destination"
            textColor="text-layout-foreground"
            className={styles.card}
          >
            <fieldset disabled={!!busy}>
              <WordPressConnection/>
              <Button fullWidth variant="flat" onClick={() => run('Connecting...', connectWP)}>
                Check WordPress Connection
              </Button>
              {connection && (
                <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 size={15} /> {connection.name || 'Connected'}
                  </span>
                  {connection.url && (
                    <a
                      href={connection.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-emerald-300 hover:text-emerald-200"
                    >
                      Visit ↗
                    </a>
                  )}
                </div>
              )}
            </fieldset>
          </Card>

          {/* HEADER & FOOTER CONFIGURATION */}
          <Card
            title="Header & Footer Settings"
            subtitle="Integrate header & footer into template parts."
            textColor="text-layout-foreground"
            className={styles.card}
          >
            <fieldset disabled={!!busy}>
              <HeaderFooterMode shared={shared} onChange={setShared}/>

              <label className={styles.field}>
                <span>Header CSS Selector</span>
                <input
                  type="text"
                  value={headerSelector}
                  onChange={(e) => setHeaderSelector(e.target.value)}
                  placeholder="e.g. header, #site-header"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs"
                />
              </label>

              <label className={styles.field}>
                <span>Footer CSS Selector</span>
                <input
                  type="text"
                  value={footerSelector}
                  onChange={(e) => setFooterSelector(e.target.value)}
                  placeholder="e.g. footer, #site-footer"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs"
                />
              </label>

              <label className={styles.field}>
                <span>Design Source Page</span>
                <select value={globalsPage} onChange={(e) => setGlobalsPage(e.target.value)}>
                  {rows.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.title} — {r.path}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </Card>

          {/* PUBLISH OPTIONS */}
          <Card
            title="Publishing Options"
            textColor="text-layout-foreground"
            className={styles.card}
          >
            <fieldset disabled={!!busy}>
              <label className={styles.field}>Homepage<select value={homepagePath} onChange={e=>setHomepagePath(e.target.value)}><option value="">Keep current homepage</option>{rows.filter(r=>r.selected).map(r=><option key={r.path} value={r.path}>{r.title} — {r.path}</option>)}</select></label>
              <label className={styles.field}>Editor<select disabled={!!savedCount||rows.some(r=>r.bundle)} value={editor} onChange={e=>setEditor(e.target.value)}><option value="gutenberg">Gutenberg</option><option value="elementor">Elementor</option></select></label>
              {editor==='elementor'&&<label className={styles.field}>Elementor edition<select disabled={!!savedCount} value={edition} onChange={e=>setEdition(e.target.value)}><option value="free">Free</option><option value="pro">Pro</option></select></label>}
              <label className={styles.field}>
                <span>Post Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="publish">Publish Live</option>
                  <option value="draft">Save as Draft</option>
                </select>
              </label>
            </fieldset>
          </Card>
        </aside>
      </div>

      {!!warnings.length&&<div className={styles.notice} role="status"><strong>Deployment notices</strong><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
      {/* ERROR MESSAGE DISPLAY */}
      {error && (
        <div role="alert" className={styles.error}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ACTION BAR */}
      <div className={styles.actionbar}>
        <div>
          <strong>
            {busy || `${selectedCount} pages ready for automated deployment`}
          </strong>
          <p>
            {savedCount} published · {editor === 'elementor' ? 'Elementor' : 'Gutenberg'} · {status}
          </p>
        </div>

        <div className={styles.toolbar}>
          {busy ? (
            <Button
              variant="outlined"
              onClick={() => {
                stop.current = true;
              }}
            >
              Stop Deployment
            </Button>
          ) : (
            <Button
              color="primary"
              isDisabled={!rows.some((r) => r.selected)}
              onClick={()=>run('Deploying site',deploySite)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg hover:shadow-emerald-500/30 transition-all text-sm"
            >
              <Play size={18} className="fill-current" />
              <span>{rows.some(r=>r.selected&&r.status!=='saved')?(status==='publish'?'Deploy & publish':'Deploy as drafts'):'Retry site settings'}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
