'use client';
import WordPressConnection from './WordPressConnection';
import {useEffect,useRef,useState} from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import TextField from '@/components/InputAndTextField';
import {Upload,Images,CheckCircle2} from 'lucide-react';
import {useStudioSession,useConnectionBusy} from './StudioSession';
import media from './media-queue.cjs';
import styles from './converter.module.css';
import SiteIdentity from './SiteIdentity';
export default function ImagesWorkspace(){
 const {requestHeaders,destinationId}=useStudioSession();
 const [files,setFiles]=useState([]),[progress,setProgress]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const stop=useRef(false);
 useConnectionBusy(busy);
 useEffect(()=>{setProgress({});setError('');},[destinationId]);
 useEffect(()=>()=>{stop.current=true;},[]);
 function select(list,folder){const selected=Array.from(list).filter(f=>/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i.test(f.name));const prefix=folder?selected[0]?.webkitRelativePath.split('/')[0]+'/':'';setFiles(selected.map(file=>({file,filename:folder?file.webkitRelativePath.slice(prefix.length):file.name,size:file.size})));setProgress({});setError('');}
 async function upload(){setBusy(true);setError('');stop.current=false;try{
  const r=await fetch('/api/wordpress/status',{headers:{...requestHeaders}});const data=await r.json();if(!r.ok)throw Error(data.error||'Connection failed.');const v=(data.version||'0').split('.').map(Number);if(!(v[0]>1||v[0]===1&&v[1]>=2))throw Error('Install WordPress Converter Bridge 1.2.0 or newer.');
  await media.uploadImages(files,{connection:requestHeaders,shouldStop:()=>stop.current,onProgress:p=>setProgress(old=>({...old,[p.filename]:p}))});
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 function download(){const urls=Object.fromEntries(Object.values(progress).filter(p=>p.url).map(p=>[p.filename,p.url]));const url=URL.createObjectURL(new Blob([JSON.stringify(urls,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='wordpress-image-urls.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const saved=Object.values(progress).filter(p=>p.status==='saved').length;
 const unique=new Set(Object.values(progress).filter(p=>p.url).map(p=>p.url)).size;
 return <div className={styles.workspace}>
  <header className={styles.heading}><div><span className={styles.eyebrow}>WORDPRESS MEDIA</span><h1>Image library</h1><p>Import your images together. Copy their WordPress URLs into any page.</p></div><span className={styles.editorBadge}><Images size={18}/> {saved} imported</span></header>
  <div className={styles.grid}><Card title="Your image queue" subtitle="Select many images or an entire folder. Up to 32 MB per image." className={styles.card} textColor="text-layout-foreground">
   <fieldset disabled={busy}><div className={styles.dropzone}><Upload size={32}/><strong>Bring your image collection</strong><span>Small uploads keep large selections moving.</span><div className={styles.toolbar}><label className={styles.fileButton}>Choose images<input type="file" accept="image/*" multiple onChange={e=>select(e.target.files,false)}/></label><label className={styles.fileButton}>Choose folder<input type="file" webkitdirectory="" directory="" multiple onChange={e=>select(e.target.files,true)}/></label></div></div></fieldset>
   {!!files.length&&<div className={styles.tableScroll}><table className={styles.queueTable}><thead><tr><th>Image</th><th>Size</th><th>Progress</th><th>WordPress URL</th></tr></thead><tbody>{files.map(f=>{const p=progress[f.filename];return <tr key={f.filename}><td>{f.filename}</td><td>{(f.size/1024/1024).toFixed(2)} MB</td><td>{p?.status==='saved'?<CheckCircle2 size={18}/>:p?`${p.status} ${p.percent}%`:'Waiting'}</td><td>{p?.url&&<><a href={p.url} target="_blank" rel="noreferrer">Open ↗</a><input aria-label={`URL for ${f.filename}`} readOnly value={p.url} onFocus={e=>e.target.select()}/></>}</td></tr>;})}</tbody></table></div>}
  </Card><aside className={styles.column}><Card title="WordPress destination" className={styles.card} textColor="text-layout-foreground"><fieldset disabled={busy}><WordPressConnection/></fieldset><p className={styles.help}>Uses the same WordPress connection as your converters. Keep this page open while uploading. Stop or retry without repeating completed chunks.</p><p className={styles.help}>Every selected filename is retained as a mapping, even when duplicate image content reuses a WordPress file. Original images are imported immediately. Automatic thumbnail generation is skipped during import to keep requests short.</p><a href="/downloads/wordpress-converter-bridge.zip" download>Download updated bridge ↗</a></Card><SiteIdentity/></aside></div>
  {error&&<div role="alert" className={styles.error}>{error}</div>}
  <div className={styles.actionbar}><div><strong>{saved} of {files.length} images imported</strong><p>{unique} unique WordPress files · {saved-unique} duplicate filenames mapped to those files.</p></div><div className={styles.toolbar}>{!!saved&&<Button variant="flat" onClick={download}>Download URL map</Button>}{busy?<Button onClick={()=>{stop.current=true;}}>Stop after current chunk</Button>:<Button color="primary" isDisabled={!files.length} onClick={upload}>{error?'Retry import':'Import images'}</Button>}</div></div>
 </div>;
}
