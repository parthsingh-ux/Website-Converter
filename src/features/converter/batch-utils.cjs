function titleFromPath(path) {
  const name=path.split('/').pop().replace(/\.html?$/i,'');
  return /^(index|home)$/i.test(name)?'Home':name.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function validateQueue(rows) {
  const selected=rows.filter(r=>r.selected && r.status!=='saved');
  if(!selected.length)throw Error('Select at least one unsaved page.');
  const paths=new Set(),slugs=new Set(),ids=new Set();
  for(const row of selected){
    if(!row.title.trim())throw Error(`Enter a page name for ${row.path}.`);
    if(paths.has(row.path))throw Error(`Duplicate source path: ${row.path}.`);paths.add(row.path);
    if(row.slug && slugs.has(row.slug))throw Error(`Duplicate slug: ${row.slug}.`);if(row.slug)slugs.add(row.slug);
    if(row.pageId && (!Number.isSafeInteger(Number(row.pageId)) || Number(row.pageId)<1))throw Error(`Invalid WordPress page ID for ${row.title}.`);
    if(row.pageId && ids.has(Number(row.pageId)))throw Error('Two selected rows cannot update the same WordPress page.');if(row.pageId)ids.add(Number(row.pageId));
  }
  return selected;
}
// Validate all conversions before the first write. Writes are ordered because the bridge locks deployment.
async function deployQueue(rows, {convert,deploy,onChange=()=>{}}) {
  const selected=validateQueue(rows),prepared=[];
  let invalid=false;
  for(const row of selected){
    onChange(row.key,{status:'converting',error:''});
    try{prepared.push({row,bundle:await convert(row)});onChange(row.key,{status:'ready'});}
    catch(error){invalid=true;onChange(row.key,{status:'invalid',error:error.message});}
  }
  if(invalid)throw Error('Fix or deselect the pages with conversion errors. No pages from this batch were pushed.');
  let saved=0;
  for(const {row,bundle} of prepared){
    onChange(row.key,{status:'uploading'});
    try{const result=await deploy(row,bundle);onChange(row.key,{status:'saved',pageId:String(result.pageId),result,error:''});saved++;}
    catch(error){onChange(row.key,{status:'failed',error:error.message});throw Error(`${row.title}: ${error.message} ${saved} page(s) saved. Retry resumes unsaved rows.`);}
  }
  return saved;
}
module.exports={titleFromPath,validateQueue,deployQueue};
