const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {convertSite}=require('../src/lib/conversion/site-bundle.cjs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../wordpress/converter-studio-bridge/assets/header-scroll.js'),'utf8');
function element(){const names=new Set();return {classList:{add:n=>names.add(n),remove:n=>names.delete(n),contains:n=>names.has(n)},style:{setProperty(k,v){this[k]=v;}}};}
test('sticky is lifted to the outer shell and responsive static/fixed modes are restored',()=>{
 const shell=element(),header=element(),events={};shell.querySelector=()=>header;let mode='sticky';
 vm.runInNewContext(code,{document:{readyState:'complete',querySelector:()=>shell},window:{addEventListener:(n,f)=>events[n]=f},requestAnimationFrame:f=>f(),getComputedStyle:()=>({position:mode,top:'12px',zIndex:'50'})});
 assert.ok(shell.classList.contains('wcs-sticky-header'));assert.equal(shell.style['--wcs-header-top'],'12px');assert.equal(shell.style['--wcs-header-layer'],'50');
 mode='static';events.resize();assert.ok(!shell.classList.contains('wcs-sticky-header'));assert.ok(!header.classList.contains('wcs-sticky-source'));
 mode='fixed';events.resize();assert.ok(!shell.classList.contains('wcs-sticky-header'));
 mode='sticky';events.resize();assert.ok(shell.classList.contains('wcs-sticky-header'));
});
for(const editor of ['gutenberg','elementor'])test(editor+' retains header marker and source sticky/fixed declarations',async()=>{
 for(const position of ['sticky','fixed']){
  const b=await convertSite({editor,title:'Scroll header',html:'<header><nav><a href="index.html">Home</a></nav></header><main>Body</main>',css:`header{position:${position};top:0;z-index:50}`});
  const p=b.parts.header;assert.match(JSON.stringify(p.content),/wcs-header-source/);assert.match(p.ecb?.css||p.patternCss,new RegExp('position:\\s*'+position));
 }
});
