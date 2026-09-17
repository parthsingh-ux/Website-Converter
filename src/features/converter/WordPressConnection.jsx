'use client';
import {useEffect,useId,useState} from 'react';
import TextField from '@/components/InputAndTextField';
import Button from '@/components/Button';
import {useStudioSession} from './StudioSession';
import styles from './converter.module.css';
export default function WordPressConnection(){
 const {sites,active,selectSite,updateConnection,locked}=useStudioSession();const id=useId();
 const [url,setUrl]=useState(active?.url||''),[username,setUsername]=useState(active?.username||''),[password,setPassword]=useState(active?.password||''),[error,setError]=useState('');
 useEffect(()=>{setUrl(active?.url||'');setUsername(active?.username||'');setPassword(active?.password||'');},[active]);
 function edit(field,value){const next={url,username,password,[field]:value};if(field==='url'||field==='username')next.password='';updateConnection(next);}
 function apply(){try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Enter the HTTPS base URL of your WordPress site.');if(!username.trim()||username.includes(':')||!password.trim())throw Error('Enter your WordPress username and Application Password.');selectSite({url,username,password});setError('');}catch(e){setError(e.message);}}
 return <fieldset disabled={locked} className={styles.column}>
 {!!sites.length&&<label className={styles.field}>Saved sites<select value="" onChange={e=>{const site=sites[Number(e.target.value)];if(site){updateConnection({url:site.url,username:site.username,password:site.password||''});}}}><option value="">Choose a site or enter a new one</option>{sites.map((s,i)=><option key={`${s.url}|${s.username}`} value={i}>{s.url} · {s.username}</option>)}</select></label>}
 <TextField id={`${id}-url`} label="WordPress URL" value={url} onChange={v=>edit('url',v)} placeholder="https://your-site.com" fullWidth variant="bordered"/>
 <TextField id={`${id}-username`} label="WordPress username" value={username} onChange={v=>edit('username',v)} autoComplete="username" fullWidth variant="bordered"/>
 <TextField id={`${id}-password`} label="Application Password" value={password} onChange={v=>edit('password',v)} isPassword autoComplete="off" fullWidth variant="bordered"/>
 <Button variant="outlined" fullWidth onClick={apply} isDisabled={locked||!url||!username||!password}>Save site to list</Button>
 {active&&<p className={styles.help}>Destination: {active.url} · {active.username}</p>}
 <p className={styles.help}>Ready to deploy with these details; saving to the list is optional. Shared across all Studio pages. Passwords stay in memory for this tab and are cleared on reload. Install and activate the bridge once on each site.</p>
 {error&&<p className={styles.rowError} role="alert">{error}</p>}
 </fieldset>;
}
