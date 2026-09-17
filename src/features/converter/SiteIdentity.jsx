'use client';
import {useState,useEffect} from 'react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import {Globe,CheckCircle2} from 'lucide-react';
import {useStudioSession,useConnectionBusy} from './StudioSession';
import media from './media-queue.cjs';
import styles from './converter.module.css';
export default function SiteIdentity(){
 const {requestHeaders,destinationId}=useStudioSession();const [file,setFile]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState('');
 useConnectionBusy(busy);
 useEffect(()=>{setSaved('');setError('');},[destinationId]);
 async function save(){setBusy('Uploading favicon');setError('');setSaved('');try{
  const statusResponse=await fetch('/api/wordpress/status',{headers:{...requestHeaders}});const status=await statusResponse.json();if(!statusResponse.ok)throw Error(status.error||'WordPress connection failed.');const version=(status.version||'0').split('.').map(Number);if(!(version[0]>1||version[0]===1&&version[1]>=3))throw Error('Install WordPress Converter Bridge 1.3.0 or newer to update the favicon.');
  const urls=await media.uploadImages([{filename:file.name,file,size:file.size}],{connection:requestHeaders,onProgress:p=>setBusy(`Uploading ${p.percent}%`)});
  setBusy('Updating site icon');const response=await fetch('/api/wordpress/identity',{method:'POST',headers:{...requestHeaders,'Content-Type':'application/json'},body:JSON.stringify({faviconUrl:urls[file.name]})});
  const result=await response.json().catch(()=>({error:'WordPress did not return a response. Retry the favicon update.'}));if(!response.ok)throw Error(result.error||'Favicon update failed. Install Bridge 1.3.0 or newer.');setSaved(result.url);
 }catch(e){setError(e.message);}finally{setBusy('');}}
 return <Card title="Site identity" subtitle="The icon visitors see in their browser tab." className={styles.card} textColor="text-layout-foreground"><div className={styles.identityRow}><span className={styles.identityIcon}>{saved?<img src={saved} alt="Saved site icon"/>:<Globe size={24}/>}</span><div><strong>WordPress favicon</strong><p className={styles.help}>Square PNG, JPEG or WebP · 512 × 512 or larger</p></div></div><fieldset disabled={!!busy}><label className={styles.fileButton}>{file?file.name:'Choose favicon'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{setFile(e.target.files[0]||null);setSaved('');setError('');}}/></label><Button fullWidth variant="flat" isDisabled={!file||!!busy} onClick={save}>{busy||'Update favicon'}</Button></fieldset><p className={styles.help}>Updates the icon across this WordPress site, for both editors.</p>{error&&<p role="alert" className={styles.rowError}>{error}</p>}{saved&&<p className={styles.connected}><CheckCircle2 size={16}/> Site icon updated</p>}</Card>;
}
