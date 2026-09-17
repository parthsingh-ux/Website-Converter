'use client';
import HeaderFooterMode from './HeaderFooterMode';
import WordPressConnection from './WordPressConnection';
import { useState, useEffect } from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import TextField from '@/components/InputAndTextField';
import { ArrowUpRight, CheckCircle2, FileCode2, Upload, Download, Globe, Layers, RefreshCw } from 'lucide-react';
import styles from './converter.module.css';
import SiteIdentity from './SiteIdentity';
import HomepageSettings from './HomepageSettings';
import BatchWorkspace from './BatchWorkspace';
import media from './media-queue.cjs';
import { useStudioSession, useConnectionBusy } from './StudioSession';

const initial = {html:'',css:'',js:'',title:'',siteKey:'default',sharedParts:true,headerSelector:'',footerSelector:'',sourcePath:'',mediaPrefix:'',edition:'free'};
function download(name, content, type='application/json') { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
const dataUrl = file => new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
export default function ConverterWorkspace({editor}) {
  const {requestHeaders,destinationId}=useStudioSession();
  const [workflow,setWorkflow]=useState('single');
  const [input,setInput]=useState(initial),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [bundle,setBundle]=useState(null),[imported,setImported]=useState(null),[tab,setTab]=useState('html'),[images,setImages]=useState([]);
  const [files,setFiles]=useState(null),[entry,setEntry]=useState(''),[connection,setConnection]=useState(null),[pages,setPages]=useState([]);
  const [mode,setMode]=useState('create'),[pageId,setPageId]=useState(''),[pageStatus,setPageStatus]=useState('draft');
  const [globals,setGlobals]=useState('keep'),[result,setResult]=useState(null),[search,setSearch]=useState(''),[requestId,setRequestId]=useState(null);
  useConnectionBusy(busy);
  useEffect(()=>{setConnection(null);setPages([]);setPageId('');setMode('create');setResult(null);setRequestId(null);},[destinationId]);
  const title=editor==='elementor'?'Elementor':'Gutenberg';
  const change=(key,value)=>{setInput(p=>({...p,[key]:value}));setBundle(null);setImported(null);setResult(null);setRequestId(null);};
  async function api(path, body) { const response=await fetch(path,{method:body?'POST':'GET',headers:{...requestHeaders,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed.');return data; }
  async function run(label, fn) {setBusy(label);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy('');}}
  async function loadFiles(list, folder=false) {
    await run('Reading files',async()=>{
      const selected=Array.from(list);
      if(selected.filter(f=>/\.(html?|css|js)$/i.test(f.name)).reduce((n,f)=>n+f.size,0)>22*1024*1024)throw Error('Text source files exceed 22 MB; images have a separate 32 MB per-file limit.');
      const textFiles={},assets=[];const prefix=folder?selected[0]?.webkitRelativePath.split('/')[0]+'/':'';
      for(const file of selected){const name=folder?file.webkitRelativePath.slice(prefix.length):file.name;
        if(/\.(html?|css|js)$/i.test(name))textFiles[name]=await file.text();
        else if(/\.(png|jpe?g|webp|gif|avif|svg|ico|bmp)$/i.test(name))assets.push({filename:name,file,size:file.size});
      }
      setImages(assets);setImported(null);setBundle(null);setResult(null);setRequestId(null);
      const htmlNames=Object.keys(textFiles).filter(n=>/\.html?$/i.test(n));
      if(folder){setFiles(textFiles);setEntry(htmlNames.find(n=>n==='index.html')||htmlNames[0]||'');}
      else {setFiles(null);setInput(p=>({...p,html:htmlNames.length?textFiles[htmlNames[0]]:p.html,sourcePath:htmlNames[0]||p.sourcePath,css:Object.keys(textFiles).filter(n=>n.endsWith('.css')).map(n=>textFiles[n]).join('\n')||p.css,js:Object.keys(textFiles).filter(n=>n.endsWith('.js')).map(n=>textFiles[n]).join('\n')||p.js}));}
    });
  }
  const buildInput=()=>({...input,editor,imageAssets:images,...(files?{files,entry}:{})});
  async function convert(forPush=false) {const next=await api('/api/convert',{...buildInput(),imageAssets:forPush?[]:await media.portableImages(images)});setBundle(next);return next;}
  async function push() {
    if(mode==='update'&&(!Number.isSafeInteger(Number(pageId))||Number(pageId)<1))throw Error('Select an existing page or enter a positive numeric page ID.');
    if(!input.title.trim()&&!imported?.title)throw Error('Enter a page title.');
    // Keep the operation ID on failure: retrying an uncertain request cannot duplicate a page.
    const operation=requestId||generateUuid();setRequestId(operation);
    const bridge=await api('/api/wordpress/status');
    const version=(bridge.version||'0').split('.').map(Number);
    if(!(version[0]>1 || version[0]===1&&version[1]>=6))throw Error('Install WordPress Converter Bridge 1.6.0 before uploading images.');
    const mediaUrls=await media.uploadImages([...images,...(imported?media.embeddedImages(imported):[])],{connection:requestHeaders,onProgress:p=>setBusy(`Images ${p.index+1}/${p.total} · ${p.filename} · ${p.percent}%`)});
    setBusy('Converting & deploying page');
    let next=imported?await api('/api/wordpress/normalize',{bundle:imported,editor,siteKey:input.siteKey,sharedParts:input.sharedParts}):await convert(true);
    const payload={bundle:media.deploymentBundle(next),mediaUrls,operationId:operation,pageId:mode==='update'?Number(pageId):0,status:pageStatus,globalPolicy:globals};
    const response=await api('/api/wordpress/deploy',payload);
    setResult(response);setMode('update');setPageId(String(response.pageId));setRequestId(null);
    setPages(p=>[{id:response.pageId,title:next.title,editor},...p.filter(x=>x.id!==response.pageId)]);
  }
  async function importJson(file) {if(!file)return;await run('Reading JSON',async()=>{if(file.size>30*1024*1024)throw Error('JSON exceeds 30 MB.');const data=JSON.parse(await file.text());const next=await api('/api/wordpress/normalize',{bundle:data,editor,siteKey:input.siteKey});setImported(next);setBundle(next);setInput(p=>({...p,title:next.title||p.title,siteKey:next.siteKey||p.siteKey,sharedParts:next.sharedParts,edition:next.edition||p.edition,sourcePath:next.sourcePath||p.sourcePath}));setResult(null);setRequestId(null);});}
  const activeBundle=bundle||imported;
  const warnings=activeBundle?.warnings||[];
  const modes=<div className={styles.workflowTabs} role="tablist" aria-label="Conversion workflow"><button role="tab" disabled={!!busy} aria-selected={workflow==='single'} onClick={()=>setWorkflow('single')}>Single page</button><button role="tab" disabled={!!busy} aria-selected={workflow==='batch'} onClick={()=>setWorkflow('batch')}>Multiple pages <span>SITE</span></button></div>;
  if(workflow==='batch')return <div className={styles.workspace}>{modes}<BatchWorkspace editor={editor} onBusyChange={setBusy}/></div>;
  return <fieldset disabled={!!busy} className={styles.workspace}>
    {modes}<header className={styles.heading}><div><span className={styles.eyebrow}>WORDPRESS CONVERTER</span><h1>{title} converter</h1><p>Build your WordPress site from source. Review the design, connect your pages, and publish when ready.</p></div><span className={styles.editorBadge}><Layers size={16}/>{editor==='elementor'?'Free & Pro':'Block editor'}</span></header>
    <div className={styles.steps}><span><b>1</b>Add your source</span><span><b>2</b>Choose page & shared parts</span><span><b>3</b>Convert & push</span></div>
    <div className={styles.grid}>
      <div className={styles.column}>
        <Card title="Source files" subtitle="Paste HTML, CSS and JavaScript, or select your static website folder." textColor="text-layout-foreground" className={styles.card}>
          <div className={styles.toolbar}>
            <label className={styles.fileButton}><Upload size={16}/> Add files<input type="file" multiple accept=".html,.htm,.css,.js,image/*" onChange={e=>loadFiles(e.target.files)}/></label>
            <label className={styles.fileButton}><FileCode2 size={16}/> Select folder<input type="file" multiple webkitdirectory="" directory="" onChange={e=>loadFiles(e.target.files,true)}/></label>
            <label className={styles.fileButton}>Import converter JSON<input type="file" accept=".json" onChange={e=>importJson(e.target.files[0])}/></label>
          </div>
          {imported?<div className={styles.notice}>JSON loaded: {imported.title}. Its saved assets and editor data will be sent to WordPress.<Button variant="light" size="sm" onClick={()=>{setImported(null);setBundle(null);setRequestId(null);}}>Return to source</Button></div>:<>
            {files?<div className={styles.notice}><label htmlFor="entry">HTML entry</label><select id="entry" value={entry} onChange={e=>{setEntry(e.target.value);setBundle(null);setRequestId(null);}}>{Object.keys(files).filter(n=>/\.html?$/i.test(n)).map(n=><option key={n}>{n}</option>)}</select><p>{Object.keys(files).length} source files loaded. Local linked CSS and scripts will be assembled in source order.</p><Button size="sm" variant="light" onClick={()=>setFiles(null)}>Use pasted source</Button></div>:<>
              <div className={styles.tabs} role="tablist" aria-label="Source language">{['html','css','js'].map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>{t.toUpperCase()}</button>)}</div>
              <TextField id="source-code" aria-label={`${tab.toUpperCase()} source`} value={input[tab]} onChange={v=>change(tab,v)} isMultiline rows={15} fullWidth variant="bordered" className={styles.code} placeholder={tab==='html'?'Paste your complete HTML document here…':`Paste your ${tab.toUpperCase()} here…`}/>
            </>}
            <div className={styles.assets}><span>{images.length} image assets attached</span><label className={styles.fileButton}>Add images<input type="file" multiple accept="image/*" onChange={e=>run('Reading images',async()=>{const additions=await Promise.all(Array.from(e.target.files).map(async f=>({filename:f.name,file:f,size:f.size})));setImages(p=>[...p.filter(a=>!additions.some(b=>a.filename===b.filename)),...additions]);setBundle(null);setRequestId(null);})}/></label></div>
            {!!images.length&&<ul className={styles.assetList}>{images.map((a,i)=><li key={a.filename}>{a.filename}<button type="button" aria-label={`Remove ${a.filename}`} onClick={()=>{setImages(p=>p.filter((_,n)=>n!==i));setBundle(null);setRequestId(null);}}>×</button></li>)}</ul>}
          </>}
        </Card>
        <Card title="Conversion output" subtitle="Review the bundle or keep a JSON copy for future updates." textColor="text-layout-foreground" className={styles.card}>
          {activeBundle?<><div className={styles.summary}>{['header','page','footer'].map(part=><div key={part}><span>{part==='page'?'Page content':`Global ${part}`}</span><strong>{activeBundle.parts[part]?'Ready':part==='page'?'Missing':!activeBundle.sharedParts?'Inside content':'Keep existing'}</strong></div>)}</div><p className={styles.muted}>{activeBundle.menus.length} dynamic menus detected</p><div className={styles.toolbar}><Button variant="outlined" onClick={()=>download(`${input.siteKey}.${editor}.json`,JSON.stringify(activeBundle,null,2))}><Download size={16}/> Download site JSON</Button><Button variant="light" onClick={()=>run('Copying',()=>navigator.clipboard.writeText(JSON.stringify(activeBundle,null,2)))}>Copy JSON</Button></div>{activeBundle.previewHtml&&<details><summary>Source preview (JavaScript disabled)</summary><iframe title="Source design preview" sandbox="" srcDoc={activeBundle.previewHtml} className={styles.preview}/><p className={styles.help}>This is the source design. Use the WordPress page link to verify the actual editor rendering.</p></details>}<div className={styles.toolbar}>{['header','page','footer'].filter(p=>activeBundle.parts[p]).map(part=><Button key={part} size="sm" variant="light" onClick={()=>download(`${input.siteKey}.${part}.${editor}.json`,JSON.stringify(activeBundle.parts[part],null,2))}>Export {part} JSON</Button>)}</div><details><summary>Warnings & compatibility ({warnings.length})</summary><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details><details><summary>View JSON</summary><pre className={styles.json}>{JSON.stringify(activeBundle,null,2)}</pre></details></>:<p className={styles.empty}><FileCode2 size={26}/>Your converted page, shared parts and menus will appear here.</p>}
        </Card>
      </div>
      <div className={styles.column}>
        <Card title="WordPress destination" subtitle="Connect once, then create or update through the API." textColor="text-layout-foreground" className={styles.card}>
          <WordPressConnection/>
          <p className={styles.help}>Select your connection above. Deployment checks it automatically; testing first is optional.</p>
          <Button variant="flat" fullWidth isDisabled={!!busy} onClick={()=>run('Connecting',async()=>{const status=await api('/api/wordpress/status');setConnection(status);const found=await api('/api/wordpress/pages?editor='+editor);setPages(found.pages);})}><Globe size={16}/> Test connection</Button>
          {connection&&<p className={styles.connected}><CheckCircle2 size={16}/>{connection.name} · {connection.elementor?`Elementor ${connection.pro?'Pro':'Free'}`:'Gutenberg ready'}</p>}
          <a className={styles.downloadLink} href="/downloads/wordpress-converter-bridge.zip" download>Download WordPress bridge plugin <ArrowUpRight size={14}/></a>
        </Card>
        <SiteIdentity/><HomepageSettings/><Card title="Page settings" textColor="text-layout-foreground" className={styles.card}>
          <TextField id="page-title" label="Page title" value={input.title} onChange={v=>change('title',v)} fullWidth variant="bordered" placeholder="Home" isDisabled={!!imported}/>
          <TextField id="source-path" label="Original page path" value={input.sourcePath} onChange={v=>change('sourcePath',v)} placeholder="index.html or about.html" fullWidth variant="bordered"/>
          <p className={styles.help}>Used to point menu links such as about.html to this WordPress page. Folder imports fill this automatically.</p>
          {editor==='elementor'&&<label className={styles.field}>Elementor edition<select disabled={!!imported} value={input.edition} onChange={e=>change('edition',e.target.value)}><option value="free">Elementor Free</option><option value="pro">Elementor Pro</option></select></label>}
          <label className={styles.field}>Action<select value={mode} onChange={e=>{setMode(e.target.value);setRequestId(null);}}><option value="create">Create a new page</option><option value="update">Update an existing page</option></select></label>
          {mode==='update'&&<><div className={styles.inline}><TextField id="page-search" aria-label="Search WordPress pages" value={search} onChange={setSearch} placeholder="Search pages" fullWidth/><Button size="sm" variant="flat" isDisabled={!!busy} onClick={()=>run('Loading pages',async()=>setPages((await api(`/api/wordpress/pages?editor=${editor}&search=${encodeURIComponent(search)}`)).pages))}><RefreshCw size={15}/></Button></div><label className={styles.field}>Existing page<select value={pageId} onChange={e=>{setPageId(e.target.value);setRequestId(null);}}><option value="">Select a page</option>{pages.map(p=><option key={p.id} value={p.id}>{p.title} (#{p.id})</option>)}</select></label><TextField id="page-id" label="Or enter page ID" value={pageId} onChange={v=>{setPageId(v);setRequestId(null);}} inputMode="numeric" fullWidth variant="bordered"/></>}
          <label className={styles.field}>Save as<select value={pageStatus} onChange={e=>{setPageStatus(e.target.value);setRequestId(null);}}><option value="draft">Draft</option><option value="publish">Published</option></select></label>
        </Card>
        <Card title="Shared header, footer & menus" subtitle="Use the same site key for pages that share navigation and branding." textColor="text-layout-foreground" className={styles.card}>
          <TextField id="site-key" label="Site key" value={input.siteKey} onChange={v=>change('siteKey',v)} isDisabled={!!imported} fullWidth variant="bordered"/>
          <HeaderFooterMode shared={input.sharedParts} onChange={value=>{if(!imported){change('sharedParts',value);return;}run('Updating header and footer mode',async()=>{const next=await api('/api/wordpress/normalize',{bundle:imported,editor,siteKey:input.siteKey,sharedParts:value});setInput(p=>({...p,sharedParts:next.sharedParts}));setBundle(next);setResult(null);setRequestId(null);});}}/>
          <label className={styles.field}>When shared parts already exist<select value={globals} onChange={e=>{setGlobals(e.target.value);setRequestId(null);}}><option value="keep">Keep current shared design and menus</option><option value="replace">Update shared design and menus from this source</option></select></label>
          <p className={styles.help}>Changes to shared parts affect every converter-managed page using this site key and editor. Other theme pages keep their existing layout.</p>
          <details><summary>Advanced source settings</summary><div className={styles.column}><TextField id="header-selector" label="Header CSS selector (optional)" value={input.headerSelector} onChange={v=>change('headerSelector',v)} placeholder="header.site-header" fullWidth variant="bordered"/><TextField id="footer-selector" label="Footer CSS selector (optional)" value={input.footerSelector} onChange={v=>change('footerSelector',v)} placeholder="footer.site-footer" fullWidth variant="bordered"/><TextField id="media-prefix" label="Media base URL (optional)" value={input.mediaPrefix} onChange={v=>change('mediaPrefix',v)} placeholder="https://cdn.example.com/assets" fullWidth variant="bordered"/></div></details>
        </Card>
      </div>
    </div>
    {error&&<div className={styles.error} role="alert">{error}</div>}
    {result&&<div className={styles.success} role="status"><CheckCircle2 size={22}/><div><strong>{result.status==='publish'?'Page published':'Draft saved'} · #{result.pageId}</strong><p>{result.message}</p><a href={result.editUrl} target="_blank" rel="noreferrer">Edit in {title} ↗</a>{result.pageUrl&&<> · <a href={result.pageUrl} target="_blank" rel="noreferrer">View page ↗</a></>}{result.warnings?.map((w,i)=><p key={i}>{w}</p>)}</div></div>}
    <footer className={styles.actionbar}><div><strong>{busy||'Ready when you are'}</strong><p>{mode==='update'?`Update page ${pageId||'…'}`:'Create a new WordPress page'} · {pageStatus==='publish'?'Publish immediately':'Save as draft'}</p></div><div className={styles.toolbar}><Button variant="flat" isDisabled={!!busy||!!imported} onClick={()=>run('Converting',()=>convert())}>Convert only</Button><Button color="primary" isLoading={!!busy} onClick={()=>run(imported?'Pushing JSON':'Converting & pushing',push)}>{imported?'Push JSON':mode==='update'?'Convert & update':'Convert & push'} <ArrowUpRight size={17}/></Button></div></footer>
  </fieldset>;
}
