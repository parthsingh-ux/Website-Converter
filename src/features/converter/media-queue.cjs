const CHUNK_SIZE=256*1024;
const jobs=new WeakMap();
function readData(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read image.'));reader.readAsDataURL(blob);});}
async function request(connection,body){
 for(let attempt=0;attempt<4;attempt++){
  try {
   const response=await fetch('/api/wordpress/media',{method:'POST',headers:{...connection,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
   const data=await response.json().catch(()=>({error:`Upload gateway returned HTTP ${response.status}. Retry to resume.`}));
   if(!response.ok){const e=Error(data.error||'Image upload failed.');e.retryable=response.status===429||response.status>=500;throw e;}
   return data;
  }catch(error){if(error.retryable===false||attempt===3)throw error;await new Promise(r=>setTimeout(r,1000*2**attempt));}
 }
}
async function uploadImages(images,{connection,onProgress=()=>{},shouldStop=()=>false,transport=request}={}){
 const urls={},paths=new Map();
 for(const image of images){const source=image.file||image.data;if(paths.has(image.filename)&&paths.get(image.filename)!==source)throw Error(`Duplicate image path: ${image.filename}. Use a folder with unique paths.`);paths.set(image.filename,source);}
 for(let index=0;index<images.length;index++){
  const image=images[index];const filename=image.filename;
  if(shouldStop())throw Error('Stopped. Retry to resume the image queue.');
  const file=image.file || await fetch(image.data).then(r=>r.blob());
  if(!file.size||file.size>32*1024*1024)throw Error(`${filename}: image must be between 1 byte and 32 MB.`);
  let job=jobs.get(image);
  // Never reuse upload jobs across different WordPress destinations or credentials.
  if(!job||job.connectionKey!==JSON.stringify(connection)){job={...await transport(connection,{action:'init',filename,size:file.size}),connectionKey:JSON.stringify(connection)};jobs.set(image,job);}
  let state=await transport(connection,{action:'status',id:job.id});
  while(!state.urls && state.offset<file.size){
   if(shouldStop())throw Error('Stopped. Retry to resume the image queue.');
   onProgress({index,total:images.length,filename,percent:Math.floor(state.offset/file.size*100),status:'uploading'});
   const data=(await readData(file.slice(state.offset,state.offset+CHUNK_SIZE))).split(',')[1];
   state=await transport(connection,{action:'chunk',id:job.id,offset:state.offset,data});
  }
  if(shouldStop())throw Error('Stopped. Retry to resume the image queue.');
  if(!state.urls){onProgress({index,total:images.length,filename,percent:100,status:'importing'});state=await transport(connection,{action:'complete',id:job.id});}
  Object.assign(urls,state.urls);onProgress({index,total:images.length,filename,percent:100,status:'saved',url:state.urls[filename]});
 }
 return urls;
}
function deploymentBundle(value){
 // Portable exports may embed images in each part as well as at the top level.
 const clean=JSON.parse(JSON.stringify(value,(key,value)=>['imagesArray','imageAssets','previewHtml'].includes(key)?undefined:value));
 return clean;
}
function embeddedImages(bundle){const out=new Map();for(const image of [...(bundle.imagesArray||[]),...Object.values(bundle.parts||{}).flatMap(p=>p?.imagesArray||[])])out.set(image.filename,image);return [...out.values()];}
async function portableImages(images){return Promise.all(images.map(async image=>({filename:image.filename,data:image.data||await readData(image.file),size:image.size})));}
module.exports={uploadImages,deploymentBundle,embeddedImages,portableImages,CHUNK_SIZE};
