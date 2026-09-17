const crypto=require('node:crypto');
const {serializeNode}=require('./engines/converter.cjs');
// Preserve native nodes and their original scoped CSS when joining a split JSON bundle.
function headerFooterMode(input,shared){
 const b=structuredClone(input);
 if(shared!==false || b.sharedParts===false)return b;
 function removeMenuMarkers(value){if(Array.isArray(value))return value.map(removeMenuMarkers);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['data-wcs-menu','data-wcs-item'].includes(key)).map(([k,v])=>[k,removeMenuMarkers(v)]));if(typeof value==='string')return value.replace(/\sdata-wcs-(?:menu|item)="[^"]*"/g,'');return value;}
 b.parts=removeMenuMarkers(b.parts);
 const parts=['header','page','footer'].map(k=>b.parts[k]).filter(Boolean);
 const hash=crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,16);
 const page=b.parts.page;
 if(b.editor==='elementor'){
  const id='ecb-'+hash;
  page.content=[{id:hash.slice(0,8),elType:'container',isInner:false,settings:{css_classes:'ecb-scope '+id,content_width:'full',flex_direction:'column',flex_gap:{column:'0',row:'0',isLinked:true,unit:'px'},padding:{top:'0',right:'0',bottom:'0',left:'0',unit:'px',isLinked:true}},elements:parts.flatMap(p=>p.content)}];
  const metas=parts.map(p=>p.ecb);
  page.ecb={...page.ecb,assetId:id,css:metas.map(m=>m.css||'').join('\n')+'\n.'+id+'{padding:0;margin:0;gap:0;width:100%;}',js:metas.map(m=>m.js||'').join('\n'),imageAttributes:Object.assign({},...metas.map(m=>m.imageAttributes||{})),builtinAssets:[...new Set(metas.flatMap(m=>m.builtinAssets||[]))],requiredWidgets:[...new Set(metas.flatMap(m=>m.requiredWidgets||[]))],unresolvedDependencies:metas.flatMap(m=>m.unresolvedDependencies||[])};
 }else{
  if(parts.some(p=>!Array.isArray(p.blockTree)))throw Error('Reconvert the original HTML to keep header/footer inside content; this JSON has no native block tree.');
  const id='gcb-'+hash;const tree=[{name:'gcb/element',attributes:{tagName:'div',className:'gcb-scope '+id,htmlAttributes:{}},innerBlocks:parts.flatMap(p=>p.blockTree)}];
  const css=parts.map(p=>p.patternCss||'').join('\n');const js=parts.map(p=>p.patternJs||'').join('\n');
  page.blockTree=tree;page.content=tree.map(serializeNode).join('');page.patternScopeId=id;page.patternCss=css;page.patternJs=js;page.manifest={...page.manifest,id,cssFile:id+'.css',jsFile:js.trim()?id+'.js':null,unresolvedDependencies:parts.flatMap(p=>p.manifest?.unresolvedDependencies||[])};
 }
 b.parts={header:null,page,footer:null};b.sharedParts=false;b.menus=[];b.fingerprint=crypto.createHash('sha256').update(JSON.stringify(b.parts)).digest('hex');return b;
}
module.exports={headerFooterMode};
