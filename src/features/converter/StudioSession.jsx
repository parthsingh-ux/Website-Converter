'use client';
import {createContext,useContext,useEffect,useState,useMemo} from 'react';
const StudioSession=createContext(null);
const KEY='wcs_wordpress_sites';
export function StudioSessionProvider({children}){
 const [sites,setSites]=useState([]),[active,setActive]=useState(null),[locks,setLocks]=useState(0);
 useEffect(()=>{try{localStorage.removeItem('wcs_studio_access_token');const stored=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(stored))setSites(stored.filter(s=>typeof s.url==='string'&&typeof s.username==='string').map(s=>({url:s.url,username:s.username})));}catch{}},[]);
 function selectSite(details){
  if(locks)return;
  const next={url:details.url.trim().replace(/\/+$/,''),username:details.username.trim(),password:details.password};
  setActive(next);
  setSites(old=>{const updated=[next,...old.filter(s=>s.url!==next.url||s.username!==next.username)];try{localStorage.setItem(KEY,JSON.stringify(updated.map(({url,username})=>({url,username}))));}catch{}return updated;});
 }
 function updateConnection(details){if(!locks)setActive(details);}
 const requestHeaders=useMemo(()=>{
  if(!active||!active.url||!active.username||!active.password)return {};
  const bytes=new TextEncoder().encode(`${active.username}:${active.password}`);
  return {'X-WordPress-URL':active.url,Authorization:'Basic '+btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))};
 },[active]);
 const destinationId=active?`${active.url}|${active.username}`:'';
 return <StudioSession.Provider value={{sites,active,selectSite,updateConnection,requestHeaders,destinationId,locked:locks>0,setLocks}}>{children}</StudioSession.Provider>;
}
export function useStudioSession(){return useContext(StudioSession);}
export function useConnectionBusy(busy){const {setLocks}=useStudioSession();useEffect(()=>{if(!busy)return;setLocks(n=>n+1);return()=>setLocks(n=>Math.max(0,n-1));},[!!busy,setLocks]);}
