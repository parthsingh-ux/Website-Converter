'use client';
import HeaderFooterMode from './HeaderFooterMode';
import WordPressConnection from './WordPressConnection';
import {useEffect,useRef,useState} from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import TextField from '@/components/InputAndTextField';
import {FolderOpen,Upload,ArrowUpRight,CheckCircle2,Layers,RefreshCw,FileText} from 'lucide-react';
import {useStudioSession,useConnectionBusy} from './StudioSession';
import batch from './batch-utils.cjs';
import media from './media-queue.cjs';
import styles from './converter.module.css';
import SiteIdentity from './SiteIdentity';
import HomepageSettings from './HomepageSettings';
const readData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
const newId=()=>globalThis.crypto?.randomUUID?.()||`batch-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export default function BatchWorkspace({editor,onBusyChange=()=>{}}){
 const {requestHeaders,destinationId}=useStudioSession();
 const [rows,setRows]=useState([]),[source,setSource]=useState({files:{},images:[]}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[siteKey,setSiteKey]=useState('default'),[edition,setEdition]=useState('free'),[status,setStatus]=useState('draft'),[policy,setPolicy]=useState('keep'),[shared,setShared]=useState(true),[connection,setConnection]=useState(null),[header,setHeader]=useState(''),[footer,setFooter]=useState(''),[globalsPage,setGlobalsPage]=useState('');
 const stop=useRef(false),attempt=useRef(null),receipts=useRef({});
 useConnectionBusy(busy);
 useEffect(()=>{setConnection(null);attempt.current=null;receipts.current={};setRows(old=>old.map(r=>({...r,pageId:'',status:'pending',result:null,error:'',operationId:newId()})));},[destinationId]);
 useEffect(()=>()=>{stop.current=true;},[]);
 const patch=(key,values)=>setRows(old=>old.map(r=>r.key===key?{...r,...values}:r));
 const edit=(key,values)=>{attempt.current=null;patch(key,{...values,status:'pending',error:'',operationId:newId()});};
 async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{...requestHeaders,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed.');return data;}
 async function run(label,fn){setBusy(label);onBusyChange(label);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy('');onBusyChange('');}}
 async function load(selected,folder){await run('Reading source files',async()=>{
  const files=Array.from(selected);if(files.filter(f=>/\.(html?|css|js|json)$/i.test(f.name)).reduce((n,f)=>n+f.size,0)>22*1024*1024)throw Error('Text source files exceed 22 MB. Images have a separate 32 MB per-file limit.');
  const map={},images=[],json=[];const prefix=folder?files[0]?.webkitRelativePath.split('/')[0]+'/':'';
  for(const file of files){const path=folder?file.webkitRelativePath.slice(prefix.length):file.name;if(/\.(html?|css|js)$/i.test(path)){if(map[path])throw Error(`Duplicate filename: ${path}. Use folder upload to preserve paths.`);map[path]=await file.text();}else if(/\.json$/i.test(path))json.push({path,data:JSON.parse(await file.text())});else if(/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i.test(path))images.push({filename:path,file,size:file.size});}
  const pages=Object.keys(map).filter(p=>/\.html?$/i.test(p)).map(path=>{const doc=new DOMParser().parseFromString(map[path],'text/html');return {key:path,path,title:doc.querySelector('title')?.textContent.trim()||doc.querySelector('h1')?.textContent.trim()||batch.titleFromPath(path),slug:'',pageId:'',selected:true,status:'pending',operationId:newId()};});
  if(!pages.length)for(const item of json){const value=await api('/api/wordpress/normalize',{bundle:item.data,editor,siteKey});pages.push({key:item.path,path:value.sourcePath||item.path.replace(/\.json$/i,'.html'),title:value.title||batch.titleFromPath(item.path),slug:'',pageId:'',selected:true,status:'pending',operationId:newId(),bundle:value});}
  if(!pages.length)throw Error('No HTML pages or converter JSON files found.');
  
  pages.sort((a,b)=>Number(!/(^|\/)index\.html?$/i.test(a.path))-Number(!/(^|\/)index\.html?$/i.test(b.path))||a.path.localeCompare(b.path));
  setSource({files:map,images});setRows(pages);setGlobalsPage(pages[0].key);attempt.current=null;receipts.current={};
 });}
 async function connect(){const c=await api('/api/wordpress/status');setConnection(c);const found=await api(`/api/wordpress/pages?editor=${editor}&siteKey=${encodeURIComponent(siteKey)}`);setRows(old=>old.map(row=>{const id=found.mappings?.[row.path]||found.pages.find(p=>p.sourcePath===row.path&&p.siteKey===siteKey)?.id;return id&&!row.pageId?{...row,pageId:String(id)}:row;}));}
 async function push(){
  stop.current=false;
  const bridge=await api('/api/wordpress/status');const version=(bridge.version||'0').split('.').map(Number);
  if(!(version[0]>1 || (version[0]===1 && version[1]>=6)))throw Error('Install WordPress Converter Bridge 1.6.0 or newer before using multi-page deployment.');
  // Keep the exact settings and IDs on uncertain network retries.
  const settings={siteKey,edition,status,policy,shared,header,footer,globalsPage};
  if(attempt.current && JSON.stringify(attempt.current)!==JSON.stringify(settings))throw Error('Settings changed after a partial push. Restore them to retry, or load the files again and match existing pages first.');
  attempt.current=settings;
  const selected=rows.filter(r=>r.selected&&r.status!=='saved');
  const primary=rows.find(r=>r.key===globalsPage);
  if(shared && policy==='replace' && !primary?.selected && primary?.status!=='saved')throw Error('Select the shared design source page, or use Keep existing shared parts.');
  const imageList=[...source.images,...rows.flatMap(r=>r.bundle?media.embeddedImages(r.bundle):[])];
  const mediaUrls=await media.uploadImages(imageList,{connection:requestHeaders,shouldStop:()=>stop.current,onProgress:p=>setBusy(`Images ${p.index+1}/${p.total} · ${p.filename} · ${p.percent}%`)});
  setBusy('Converting & deploying pages');
  const ordered=[...rows].sort((a,b)=>Number(b.key===globalsPage)-Number(a.key===globalsPage));
  await batch.deployQueue(ordered,{
   convert:async row=>{
    if(stop.current)throw Error('Stopped before deployment.');
    if(row.bundle){const b=structuredClone(row.bundle);b.title=row.title;b.siteKey=siteKey;b.sourcePath=row.path;return await api('/api/wordpress/normalize',{bundle:b,editor,siteKey,sharedParts:shared});}
    const converted=await api('/api/convert',{editor,edition,title:row.title,siteKey,sharedParts:shared,headerSelector:header,footerSelector:footer,sourcePath:row.path,files:source.files,entry:row.path,imageAssets:[]});
    for(const [part,bundle] of Object.entries(converted.parts)){const missing=bundle?.ecb?.unresolvedDependencies||bundle?.manifest?.unresolvedDependencies||[];if(missing.length)throw Error(`${part}: missing source dependencies. Include every linked stylesheet and script in the folder.`);}
    return converted;
   },
   deploy:async(row,bundle)=>{
    if(stop.current)throw Error('Stopped. Already saved pages remain available.');
    const result=await api('/api/wordpress/deploy',{bundle:media.deploymentBundle(bundle),mediaUrls,operationId:row.operationId,pageId:row.pageId?Number(row.pageId):0,slug:row.slug||undefined,status,globalPolicy:row.key===globalsPage?policy:'keep'});
    receipts.current[row.key]={path:row.path,title:row.title,...result};return result;
   },onChange:patch
  });
 }
 const saved=rows.filter(r=>r.status==='saved').length,selected=rows.filter(r=>r.selected).length;
 return <div className={styles.batchArea}>
  <div className={styles.batchOverview}><div><span className={styles.eyebrow}>SITE WORKSPACE</span><h2>One website. All your pages.</h2><p>Upload a static site, name its pages, and send them to WordPress together.</p></div><div className={styles.batchStats}><b>{rows.length}<small>pages loaded</small></b><b>{saved}<small>saved to WordPress</small></b></div></div>
  <div className={styles.batchGrid}><div>
   <Card title="Website files" subtitle="HTML pages, shared CSS and JavaScript, plus your images." textColor="text-layout-foreground" className={styles.card}>
    <fieldset disabled={!!busy}><div className={styles.dropzone}><FolderOpen size={34}/><strong>Bring your complete website</strong><span>Folder upload preserves nested paths and linked assets.</span><div className={styles.toolbar}><label className={styles.fileButton}><FolderOpen size={16}/> Choose folder<input type="file" webkitdirectory="" directory="" multiple onChange={e=>load(e.target.files,true)}/></label><label className={styles.fileButton}><Upload size={16}/> Choose files<input type="file" multiple accept=".html,.htm,.css,.js,.json,image/*" onChange={e=>load(e.target.files,false)}/></label></div></div></fieldset>
   </Card>
   <Card title="Pages to deploy" subtitle="Rename pages and optionally choose slugs or existing WordPress page IDs." textColor="text-layout-foreground" className={styles.card}>
    {rows.length?<><div className={styles.queueTools}><label><input type="checkbox" disabled={!!busy} checked={rows.every(r=>r.selected)} onChange={e=>setRows(old=>old.map(r=>({...r,selected:e.target.checked})))}/> Select all ({rows.length})</label><Button size="sm" variant="light" isDisabled={!!busy} onClick={()=>run('Matching existing pages',connect)}><RefreshCw size={14}/> Match existing pages</Button></div><div className={styles.tableScroll}><table className={styles.queueTable}><thead><tr><th>Use</th><th>Source & page name</th><th>URL slug</th><th>Page ID</th><th>Progress</th></tr></thead><tbody>{rows.map(row=><tr key={row.key}><td><input aria-label={`Select ${row.path}`} type="checkbox" disabled={!!busy} checked={row.selected} onChange={e=>patch(row.key,{selected:e.target.checked})}/></td><td><input aria-label={`Name for ${row.path}`} disabled={!!busy||row.status==='saved'} value={row.title} onChange={e=>edit(row.key,{title:e.target.value})}/><small>{row.path}</small>{row.key===globalsPage&&<span className={styles.sourcePill}>Shared design source</span>}</td><td><input aria-label={`Slug for ${row.path}`} disabled={!!busy||row.status==='saved'} value={row.slug} placeholder="Automatic" onChange={e=>edit(row.key,{slug:e.target.value})}/></td><td><input aria-label={`Page ID for ${row.path}`} disabled={!!busy||row.status==='saved'} value={row.pageId} placeholder="New" inputMode="numeric" onChange={e=>edit(row.key,{pageId:e.target.value})}/></td><td><span className={styles.progressPill} data-state={row.status}>{row.status}</span>{row.error&&<p className={styles.rowError}>{row.error}</p>}{row.result&&<><a href={row.result.editUrl} target="_blank" rel="noreferrer">Edit page ↗</a>{row.result.pageUrl&&<a href={row.result.pageUrl} target="_blank" rel="noreferrer">View page ↗</a>}</>}</td></tr>)}</tbody></table></div><p className={styles.help}>Pages are converted before publishing starts, then saved in order to keep shared menus consistent. Completed pages are skipped on retry.</p></>:<div className={styles.empty}><FileText size={28}/><p>Your pages will appear here after upload.</p></div>}
   </Card>
  </div><aside className={styles.column}>
   <Card title="Destination" textColor="text-layout-foreground" className={styles.card}><fieldset disabled={!!busy}><WordPressConnection/><Button fullWidth variant="flat" onClick={()=>run('Connecting',connect)}>Connect WordPress</Button>{connection&&<p className={styles.connected}><CheckCircle2 size={15}/>{connection.name}</p>}<a className={styles.downloadLink} href="/downloads/wordpress-converter-bridge.zip" download>Download updated bridge ↗</a></fieldset></Card>
   <SiteIdentity/><HomepageSettings/><Card title="Site settings" textColor="text-layout-foreground" className={styles.card}><fieldset disabled={!!busy||!!saved}>
    <TextField id="batch-site-key" label="Shared site key" value={siteKey} onChange={setSiteKey} fullWidth variant="bordered"/>
    {editor==='elementor'&&<label className={styles.field}>Edition<select value={edition} onChange={e=>setEdition(e.target.value)}><option value="free">Elementor Free</option><option value="pro">Elementor Pro</option></select></label>}
    <label className={styles.field}>Save pages as<select value={status} onChange={e=>setStatus(e.target.value)}><option value="draft">Draft</option><option value="publish">Published</option></select></label>
    <HeaderFooterMode shared={shared} onChange={setShared}/>
    <label className={styles.field}>Shared design source<select value={globalsPage} onChange={e=>setGlobalsPage(e.target.value)}>{rows.map(r=><option key={r.key} value={r.key}>{r.title} — {r.path}</option>)}</select></label>
    <label className={styles.field}>Existing shared design<select value={policy} onChange={e=>setPolicy(e.target.value)}><option value="keep">Keep existing</option><option value="replace">Replace from selected source page</option></select></label>
    <details><summary>Header & footer selectors</summary><TextField id="batch-header" label="Header selector" value={header} onChange={setHeader} placeholder="#site-header" fullWidth/><TextField id="batch-footer" label="Footer selector" value={footer} onChange={setFooter} placeholder="#site-footer" fullWidth/></details>
   </fieldset><div className={styles.menuNote}><Layers size={18}/><p>Menu links use original file paths. Once the pages are saved, shared menus point to their WordPress URLs—even when page names or slugs change.</p></div></Card>
  </aside></div>
  {error&&<div role="alert" className={styles.error}>{error}</div>}
  <div className={styles.actionbar}><div><strong>{busy||`${selected} pages selected`}</strong><p>{saved} saved · {editor==='elementor'?'Elementor':'Gutenberg'} · {status}</p></div><div className={styles.toolbar}>{!!saved&&<Button variant="light" onClick={()=>{const blob=new Blob([JSON.stringify(Object.values(receipts.current),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='deployment-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Download results</Button>}{busy?<Button variant="outlined" onClick={()=>{stop.current=true;}}>Stop after current step</Button>:<Button color="primary" isDisabled={!rows.some(r=>r.selected&&r.status!=='saved')} onClick={()=>run('Converting & deploying pages',push)}>Deploy selected pages <ArrowUpRight size={16}/></Button>}</div></div>
 </div>;
}
