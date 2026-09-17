const test=require('node:test'),assert=require('node:assert/strict'),postcss=require('postcss');
const {convertHtmlToElementorJson:convert}=require('../src/lib/conversion/engines/elementor-converter.cjs');
for(const selector of ['nav a.active','nav a.is-active','nav a[aria-current="page"]'])test(selector+' remains conditional on the current link',async()=>{
 const b=await convert({html:'<nav><a class="active" aria-current="page" href="index.html">Home</a><a href="about.html">About</a></nav>',css:selector+'{border-bottom:2px solid red;color:red}'});
 const rules=[];postcss.parse(b.ecb.css).walkRules(r=>{if(r.nodes.some(d=>d.prop==='border-bottom'))rules.push(r.selector);});
 assert.ok(rules.length>=2);for(const r of rules)assert.match(r,/\.active|\.is-active|\[aria-current/);
});
