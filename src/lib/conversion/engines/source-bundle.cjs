'use strict';
// Assemble a user-selected static project. Never fetch URLs or execute source JS.
const path=require('node:path').posix;
const cheerio=require('cheerio');
const postcss=require('postcss');
const remote=u=>/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
function cleanPath(value){if(typeof value!=='string'||value.includes('\\')||value.includes('\0'))throw Error('Invalid source path.');const p=path.normalize(value.replace(/^\//,''));if(p==='..'||p.startsWith('../'))throw Error('Source path escapes the selected folder.');return p;}
function assembleSourceBundle({files,entry,mediaPrefix=''}){
 if(!files||typeof files!=='object'||Array.isArray(files)||typeof entry!=='string'||typeof mediaPrefix!=='string')throw Error('Choose a source folder and an HTML entry.');
 const names=Object.keys(files);if(names.length>500)throw Error('Select a static export folder with at most 500 HTML/CSS/JS files.');
 const map=new Map();let total=0;for(const name of names){const key=cleanPath(name);if(map.has(key)||typeof files[name]!=='string')throw Error('Duplicate path or non-text source file.');total+=Buffer.byteLength(files[name]);map.set(key,files[name]);}if(total>30*1024*1024)throw Error('Source text exceeds 30 MB. Select the built static export, excluding node_modules.');
 entry=cleanPath(entry);if(!map.has(entry)||! /\.html?$/i.test(entry))throw Error('The HTML entry is missing.');
 const loaded=[];const warnings=[];
 function local(url,from){return cleanPath(url.startsWith('/')?url:path.join(path.dirname(from),url));}
 function resource(url,from){if(!url||remote(url)||url.startsWith('/'))return url;const m=url.match(/^([^?#]*)(.*)$/);const resolved=local(m[1],from);return (mediaPrefix?mediaPrefix.replace(/\/$/,'')+'/':'')+resolved+m[2];}
 function read(url,from){const key=local(url.split(/[?#]/)[0],from);if(!map.has(key))throw Error('Missing linked source file: '+key+'. Include it in the selected folder.');loaded.push(key);return {key,text:map.get(key)};}
 function css(text,from,chain=[]){if(chain.includes(from))throw Error('Circular CSS @import: '+[...chain,from].join(' -> '));const ast=postcss.parse(text);ast.walkAtRules('import',rule=>{
   const m=rule.params.match(/^(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*(.*)$/i);if(!m)throw Error('Unsupported CSS @import in '+from);const url=m[2]||m[4],condition=m[5];if(remote(url)){warnings.push('External CSS dependency retained: '+url);return;}
   if(/\b(?:layer|supports)\b/.test(condition))throw Error('Expand layer()/supports() CSS imports in your build before converting: '+from);
   const child=read(url,from),expanded=postcss.parse(css(child.text,child.key,[...chain,from]));
   if(condition){const media=postcss.atRule({name:'media',params:condition});media.append(expanded.nodes);rule.replaceWith(media);}else rule.replaceWith(...expanded.nodes);
 });
 // Only rebase declarations originating in this file; imported declarations have
 // already been rebased by recursion and must not be prefixed a second time.
 ast.walkDecls(decl=>{if(decl.source?.input?.css!==text)return;decl.value=decl.value.replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi,(_,q,a,b)=>'url('+JSON.stringify(resource(a===undefined?b.trim():a,from))+')');});return ast.toString();}
 const $=cheerio.load(map.get(entry),{scriptingEnabled:false});
 if($('base[href]').length)throw Error('Resolve the document base URL into source paths before folder import.');
 // Expand styles in DOM order, so a late stylesheet still overrides early inline styles.
 $('style,link[rel="stylesheet"]').each((_,node)=>{
  if(node.name==='style'){$(node).text(css($(node).html()||'',entry).replace(/<\/style/gi,'<\\/style'));return;}
  const url=node.attribs.href||'';if(remote(url)){warnings.push('External stylesheet retained: '+url);return;}
  if(node.attribs.disabled!==undefined){$(node).remove();return;}
  const file=read(url,entry);let value=css(file.text,file.key);if(node.attribs.media)value='@media '+node.attribs.media+'{'+value+'}';
  const style=$('<style></style>').text(value.replace(/<\/style/gi,'<\\/style'));$(node).replaceWith(style);
 });
 $('script').each((_,node)=>{
  const type=(node.attribs.type||'').toLowerCase();if(type==='module')throw Error('ES module applications require a rendered static export or a classic-script build; module imports are not executed by this converter.');
  if(type&&!['text/javascript','application/javascript'].includes(type)){ return; /* Keep typed data scripts intact; never execute or concatenate them. */}
  const src=node.attribs.src;if(!src)return;if(remote(src)){warnings.push('External script retained: '+src);return;}
  const file=read(src,entry);if(node.attribs.async!==undefined)warnings.push('Async source script '+file.key+' is serialized in document order; verify its initialization.');
  $(node).removeAttr('src').removeAttr('async').removeAttr('defer').text(file.text.replace(/<\/script/gi,'<\\/script'));
 });
 $('[style]').each((_,node)=>{const rule=css('x{'+node.attribs.style+'}',entry);$(node).attr('style',rule.slice(rule.indexOf('{')+1,rule.lastIndexOf('}')));});
 $('[src],[poster]').not('script').each((_,node)=>{for(const attr of ['src','poster'])if(node.attribs[attr])$(node).attr(attr,resource(node.attribs[attr],entry));});
 $('[srcset]').each((_,node)=>{if(/data:/i.test(node.attribs.srcset)){warnings.push('Data URL srcset retained; verify complex responsive image candidates.');return;}$(node).attr('srcset',node.attribs.srcset.split(',').map(part=>{const [url,...rest]=part.trim().split(/\s+/);return [resource(url,entry),...rest].join(' ');}).join(', '));});
 return {html:$.html(),css:'',js:'',manifest:{entry,loadedFiles:[...new Set(loaded)],warnings,mediaPaths:'Relative directory structure preserved; upload matching images/fonts separately.'}};
}
module.exports={assembleSourceBundle};
