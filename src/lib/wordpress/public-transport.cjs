'use strict';
const https = require('node:https');
const dns = require('node:dns');
const {isIP, BlockList} = require('node:net');
const blocked = new BlockList();
for (const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(address,prefix,'ipv4');
function isPublicAddress(address) {
 const family=isIP(address);
 if(family===4)return !blocked.check(address,'ipv4');
 // Accept only IPv6 global unicast, excluding transition and documentation ranges.
 if(family===6){const ranges=new BlockList();ranges.addSubnet('2000::',3,'ipv6');const exceptions=new BlockList();for(const [a,p] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]])exceptions.addSubnet(a,p,'ipv6');return ranges.check(address,'ipv6')&&!exceptions.check(address,'ipv6');}
 return false;
}
function validateSiteUrl(value) {
 if(typeof value!=='string'||!value.trim())throw Object.assign(Error('Enter your WordPress site URL.'),{status:401});
 let url;try{url=new URL(value.trim());}catch{throw Error('Enter a valid WordPress site URL.');}
 if(url.protocol!=='https:')throw Error('Use an HTTPS WordPress URL.');
 if(url.username||url.password||url.search||url.hash)throw Error('Use a site URL without credentials, query or fragment.');
 if(url.port && url.port!=='443')throw Error('Use the standard HTTPS port for WordPress.');
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(host==='localhost'||host.endsWith('.localhost')||isIP(host)&&!isPublicAddress(host))throw Error('WordPress must use a public internet address.');
 return url.toString().replace(/\/+$/,'');
}
function safeLookup(hostname,options,callback){
 dns.lookup(hostname,{all:true,verbatim:true},(error,addresses)=>{
  if(error)return callback(Error('Unable to resolve the WordPress hostname.'));
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))return callback(Error('WordPress must resolve only to public internet addresses.'));
  // Pin the socket to the addresses checked here; never perform a second lookup.
  if(options.all)return callback(null,addresses);
  const chosen=addresses.find(a=>!options.family||a.family===options.family)||addresses[0];callback(null,chosen.address,chosen.family);
 });
}
function publicFetch(target,options={}){
 const checked=new URL(target);checked.search="";validateSiteUrl(checked.toString());
 return new Promise((resolve,reject)=>{
  const req=https.request(target,{method:options.method,headers:options.headers,lookup:safeLookup,agent:false,signal:options.signal},res=>{
   if(res.statusCode>=300&&res.statusCode<400){res.resume();reject(Error('WordPress redirected the request. Enter its final HTTPS site URL.'));return;}
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>32*1024*1024){res.destroy(Error('WordPress response exceeds 32 MB.'));return;}chunks.push(chunk);});
   res.on('error',reject);res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
  });
  req.on('error',error=>reject(Error(error.name==='AbortError'?'WordPress request timed out. Retry to resume completed work.':error.message)));
  req.end(options.body);
 });
}
module.exports={publicFetch,validateSiteUrl,isPublicAddress,safeLookup};
