const test=require('node:test'),assert=require('node:assert/strict'),cheerio=require('cheerio'),postcss=require('postcss');
const {convertHtmlToElementorJson:convert}=require('../src/lib/conversion/engines/elementor-converter.cjs');
const {assembleSourceBundle:assemble}=require('../src/lib/conversion/engines/source-bundle.cjs');
const flat=ns=>ns.flatMap(n=>[n,...flat(n.elements||[])]);
const find=(d,cls)=>flat(d.content).find(n=>(n.settings.css_classes||n.settings._css_classes||'').split(/\s+/).includes(cls));
const retained=d=>flat(d.content).map(n=>n.settings.html||n.settings.editor||n.settings.title||n.settings.text||'').join('');
test('Unrelated storefront: grid, prices, product attributes and responsive CSS survive',async()=>{
 const d=await convert({html:'<main class="catalog"><article><img src="/m/wheat.jpg" alt="Wheat"><h3>Sharbati Wheat</h3><p>₹62/kg</p><button class="add" data-product="wheat" type="button">Enquire</button></article><article><h3>Rice</h3></article></main>',css:'.catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}@media(max-width:720px){.catalog{grid-template-columns:1fr}}'});
 assert.equal(find(d,'catalog').settings.grid_columns_grid.size,'repeat(2,minmax(0,1fr))');assert.match(retained(d),/₹62\/kg/);assert.match(retained(d),/data-product="wheat"/);assert.match(d.ecb.css,/max-width:720px/);
});
test('Unrelated editorial page: custom properties, sidebar and clamp typography remain',async()=>{
 const d=await convert({html:'<main class="journal"><article><h1>Field notes</h1><p>Today’s observations.</p></article><aside>Archive</aside></main>',css:':root{--gutter:2rem}.journal{display:grid;grid-template-columns:3fr 1fr;gap:var(--gutter)}h1{font-size:clamp(2rem,5vw,4rem)}'});
 assert.equal(find(d,'journal').settings.container_type,'grid');assert.match(d.ecb.css,/gap:var\(--gutter\)/);assert.match(d.ecb.css,/clamp\(2rem,5vw,4rem\)/);assert.match(retained(d),/Archive/);
});
test('Unrelated RTL application: direction and complex form controls are preserved',async()=>{
 const d=await convert({edition:'pro',html:'<!doctype html><html lang="ar" dir="rtl"><body><form action="/submit"><label>الاسم<input name="name" required></label><select name="plan"><option value="basic">أساسي</option></select><input type="checkbox" name="terms"><button type="submit">إرسال</button></form></body></html>',css:'form{padding-inline:2rem}'});
 const $=cheerio.load(retained(d));assert.equal(d.ecb.rootAttributes.dir,'rtl');assert.equal($('option').text(),'أساسي');assert.equal($('form').attr('action'),'/submit');assert.equal($('input[type=checkbox]').length,1);
});
test('Unrelated dashboard: table spans, accessibility labels and numeric values survive',async()=>{
 const d=await convert({html:'<section><h2>Quarterly totals</h2><table aria-label="Revenue"><thead><tr><th colspan="2">Q1</th></tr></thead><tbody><tr><td>1,250.50</td><td>−12%</td></tr></tbody></table></section>',css:'table{border-collapse:collapse}td{padding:12px;text-align:right}'});
 const $=cheerio.load(retained(d));assert.equal($('table').attr('aria-label'),'Revenue');assert.equal($('th').attr('colspan'),'2');assert.deepEqual($('td').toArray().map(n=>$(n).text()),['1,250.50','−12%']);
});
test('Centered call-to-action keeps inline participation rather than becoming a left-aligned block',async()=>{
 const d=await convert({html:'<section class="invitation"><h2>Join us</h2><a class="btn" href="/signup">Sign up</a></section>',css:'.invitation{text-align:center;padding:48px}.btn{display:inline-flex}'});
 const baseline=[];postcss.parse(d.ecb.css).walkRules(r=>{if(r.selector.endsWith('.elementor-widget-button'))baseline.push(r.toString())});assert(baseline.some(s=>s.includes('display:inline-flex')));assert.match(d.ecb.css,/text-align:center/);
});
test('Renaming arbitrary layout classes does not change native layout settings',async()=>{
 const source=name=>({html:`<section class="${name}"><h2>Title</h2><div><p>Text</p></div></section>`,css:`.${name}{display:flex;gap:18px;padding:32px;align-items:center}`});
 const a=await convert(source('portfolio-band')),b=await convert(source('x9283'));
 const strip=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='css_classes'));
 assert.deepEqual(strip(find(a,'portfolio-band').settings),strip(find(b,'x9283').settings));
});
test('Unrelated responsive cards retain sibling selectors, hover pseudo-elements and custom breakpoints',async()=>{
 const d=await convert({html:'<div class="tiles"><article><h3>One</h3></article><article><h3>Two</h3></article></div>',css:'.tiles{display:flex;flex-wrap:wrap}.tiles article+article{border-left:2px solid red}.tiles article:hover:after{content:"+";position:absolute;right:8px}@media(max-width:900px){.tiles{flex-direction:column}}'});
 assert.equal(find(d,'tiles').settings.flex_wrap,'wrap');assert.match(d.ecb.css,/border-left:2px solid red/);assert.match(d.ecb.css,/:hover.*:after/);assert.match(d.ecb.css,/max-width:900px/);
});
test('Behavior-bearing links and non-Lucide icon placeholders are not silently sanitized',async()=>{
 const d=await convert({html:'<a class="btn" href="/order" data-cart="42" aria-label="Order item">Buy</a><i data-feather="shopping-cart"></i>'});
 assert.equal(d.content[0].elType,'container');assert.match(d.content[0].settings.css_classes,/ecb-scope/);
 const $=cheerio.load(retained(d));assert.equal($('a').attr('data-cart'),'42');assert.equal($('a').attr('aria-label'),'Order item');assert.equal($('[data-feather]').length,1);assert(d.ecb.fallbacks.length>=2);
});
test('Folder input preserves stylesheet and script order while resolving nested imports and media paths',()=>{
 const d=assemble({entry:'pages/index.html',mediaPrefix:'/uploads/demo',files:{'pages/index.html':'<link rel="stylesheet" href="../css/base.css"><style>h1{color:green}</style><link rel="stylesheet" href="../css/last.css"><script src="../js/a.js"></script><script>second()</script><img src="../images/a.png">','css/base.css':'@import "parts/type.css" screen;h1{color:red;background:url(../images/back.png)}','css/parts/type.css':'@font-face{font-family:Demo;src:url(../../fonts/a.woff2)}','css/last.css':'h1{color:blue}','js/a.js':'first()'}});
 const $=cheerio.load(d.html);assert.match($('style').first().text(),/@media screen/);assert.match($('style').first().text(),/\/uploads\/demo\/fonts\/a.woff2/);assert.match($('style').first().text(),/\/uploads\/demo\/images\/back.png/);assert.equal($('img').attr('src'),'/uploads/demo/images/a.png');assert.deepEqual($('script').toArray().map(n=>$(n).html()),['first()','second()']);assert.deepEqual($('style').toArray().map(n=>$(n).text().includes('green')), [false,true,false]);
});
test('Folder import reports a missing second stylesheet rather than assuming CSS input was complete',()=>{
 assert.throws(()=>assemble({entry:'index.html',files:{'index.html':'<link rel="stylesheet" href="base.css"><link rel="stylesheet" href="tweaks.css">','base.css':'body{margin:0}'}}),/Missing linked source file: tweaks.css/);
});
test('Folder import stops cyclic stylesheets, path traversal and unsupported module applications',()=>{
 assert.throws(()=>assemble({entry:'index.html',files:{'index.html':'<link rel="stylesheet" href="a.css">','a.css':'@import "b.css";','b.css':'@import "a.css";'}}),/Circular CSS/);
 assert.throws(()=>assemble({entry:'index.html',files:{'index.html':'<link rel="stylesheet" href="../secret.css">'}}),/escapes/);
 assert.throws(()=>assemble({entry:'index.html',files:{'index.html':'<script type="module" src="app.js"></script>','app.js':'import x from "x"'}}),/rendered static export/);
});
test('Complete folder input converts through both Free and Pro with no missing local dependencies',async()=>{
 const input=assemble({entry:'index.html',files:{'index.html':'<link rel="stylesheet" href="base.css"><link rel="stylesheet" href="extras.css"><h1>Different project</h1><div class="photo"></div>','base.css':'h1{font-size:42px}','extras.css':'.photo{height:220px;background-image:url(images/example.jpg)}'}});
 for(const edition of ['free','pro']){const d=await convert({...input,edition});assert.deepEqual(d.ecb.unresolvedDependencies,[]);assert.match(d.ecb.css,/height:220px/);assert(!d.ecb.warnings.some(w=>w.includes('may collapse')));}
});

test('Typed JSON data is retained as markup and never appended to executable JS',async()=>{
 const d=await convert({html:'<html><head><script type="application/ld+json">{"@type":"Organization","name":"Example"}</script></head><body><h1>Example</h1><script type="application/json" id="state">{"items":[1,2]}</script><script>ready()</script></body></html>'});
 assert.equal(d.ecb.js,'ready()');const $=cheerio.load(retained(d));assert.equal($('script[type="application/ld+json"]').length,1);assert.equal($('#state').text(),'{"items":[1,2]}');
});
test('Direct module input reports its execution boundary clearly',async()=>{
 await assert.rejects(convert({html:'<div id="root"></div><script type="module" src="/app.js"></script>'}),/rendered static HTML/);
});

test('Folder import retains existing site-relative and remote media URLs',()=>{
 const d=assemble({entry:'index.html',mediaPrefix:'/uploads/new',files:{'index.html':'<img src="/wp-content/uploads/old/a.png"><img src="https://example.org/b.png"><style>.x{background:url(/assets/existing.png)}</style>'}});
 const $=cheerio.load(d.html);assert.deepEqual($('img').toArray().map(n=>$(n).attr('src')),['/wp-content/uploads/old/a.png','https://example.org/b.png']);assert.match($('style').text(),/url\("\/assets\/existing.png"\)/);
});
