'use client';
import {useState,useEffect} from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import {useStudioSession,useConnectionBusy} from './StudioSession';
import styles from './converter.module.css';
export default function HomepageSettings(){
 const {requestHeaders,destinationId}=useStudioSession();const [pages,setPages]=useState([]),[pageId,setPageId]=useState(''),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useConnectionBusy(busy);
 useEffect(()=>{setPages([]);setPageId('');setMessage('');setError('');},[destinationId]);
 async function call(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{...requestHeaders,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'WordPress request failed.');return d;}
 async function run(fn){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Card title="WordPress homepage" subtitle="Choose the page shown at your site's main URL." className={styles.card} textColor="text-layout-foreground"><fieldset disabled={busy}><label className={styles.field}>Find a published page<input className={styles.homeSearch} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Page title"/></label><Button fullWidth variant="flat" onClick={()=>run(async()=>{const data=await call('/api/wordpress/pages?search='+encodeURIComponent(search));setPages(data.pages.filter(p=>p.status==='publish'));})}>Load pages</Button><label className={styles.field}>Homepage<select value={pageId} onChange={e=>setPageId(e.target.value)}><option value="">Choose a published page</option>{pages.map(p=><option key={p.id} value={p.id}>{p.title} · #{p.id}</option>)}</select></label><Button fullWidth isDisabled={!pageId||busy} onClick={()=>run(async()=>{const data=await call('/api/wordpress/homepage',{pageId:Number(pageId)});setMessage(data.message);})}>Set as homepage</Button></fieldset><p className={styles.help}>Applies to the entire WordPress site. Publish a new page first, then load the list. Supports both editors.</p>{message&&<p role="status" className={styles.connected}>{message}</p>}{error&&<p role="alert" className={styles.rowError}>{error}</p>}</Card>;
}
