const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const cheerio=require('cheerio');const postcss=require('postcss');
const {convertHtmlToElementorJson,specificity}=require('../src/lib/conversion/engines/elementor-converter.cjs');
const flat=nodes=>nodes.flatMap(n=>[n,...flat(n.elements||[])]);
const fixture=e=>fs.readFileSync(path.join(__dirname,'fixtures','roof-rangers.'+e),'utf8');
const source={html:fixture('html'),css:fixture('css'),js:fixture('js'),title:'Roof Rangers',mediaPrefix:'/wp-content/uploads/2026/08/'};
const findClass=(data,cls)=>flat(data.content).find(n=>(n.settings.css_classes||n.settings._css_classes||'').split(/\s+/).includes(cls));
test('Free roofing export uses native widgets and preserves its form as an explicit HTML fallback',async()=>{
 const data=await convertHtmlToElementorJson({...source,edition:'free'});const all=flat(data.content);
 assert.equal(data.version,'0.4');assert.equal(data.type,'page');assert.equal(all.length,290);assert.equal(new Set(all.map(x=>x.id)).size,all.length);
 assert.equal(all.filter(n=>n.widgetType==='form').length,0);assert.equal(all.filter(n=>n.widgetType==='heading').length,33);assert.equal(all.filter(n=>n.widgetType==='image').length,17);
 assert.equal(data.ecb.fallbacks.length,7);assert.equal(data.ecb.requiredWidgets.includes('form'),false);
 assert.match(data.content[0].settings.css_classes,/ecb-scope/);assert.equal(data.content[0].settings._css_classes,undefined);
 const form=all.find(n=>n.widgetType==='html'&&n.settings.html.includes('<form'));const $=cheerio.load(form.settings.html);assert.equal($('input').length,4);assert.equal($('textarea').length,1);
 assert.equal(all.filter(n=>n.widgetType==='html'&&n.settings.html.includes('<iframe')).length,1);
 assert.equal(all.filter(n=>n.widgetType==='html'&&n.settings.html.includes('<details')).length,5);
});
test('Pro roofing export has five native form fields and no configured delivery action',async()=>{
 const data=await convertHtmlToElementorJson({...source,edition:'pro'});const form=flat(data.content).find(n=>n.widgetType==='form');assert(form);
 assert.equal(form.settings.form_fields.length,5);assert.deepEqual(form.settings.form_fields.map(f=>f.placeholder),['Name','Phone','Email','Area','Tell us about your roof']);
 assert.equal(form.settings.form_fields[4].field_type,'textarea');assert.equal(form.settings.button_text,'Send my details');assert.deepEqual(form.settings.submit_actions,[]);assert.equal(data.ecb.fallbacks.length,6);
});
test('Native controls retain grid layout, gap, padding and typography values',async()=>{
 const data=await convertHtmlToElementorJson({...source,edition:'free'});
 const services=findClass(data,'service-grid');assert.equal(services.settings.container_type,'grid');assert.equal(services.settings.grid_gaps.row,'6');assert.equal(services.settings.grid_columns_grid.size,'repeat(4,1fr)');assert.equal(services.settings.grid_rows_grid.size,'none');
 const process=findClass(data,'process');assert.equal(process.settings.padding.top,'110');assert.equal(process.settings.padding.right,'0');
 const heading=flat(data.content).find(n=>n.widgetType==='heading'&&n.settings.header_size==='h1');assert.equal(heading.settings.typography_font_size.size,68);assert.equal(heading.settings.typography_font_family,'Arial');
 assert.match(data.ecb.css,/@media\s*\(max-width:\s*980px\)/);assert.match(data.ecb.css,/margin:8px/);assert.match(data.ecb.css,/calc\(/);
});
test('Standard breakpoint controls preserve desktop/tablet/mobile settings',async()=>{
 const data=await convertHtmlToElementorJson({html:'<h1>Title</h1>',css:'h1{font-size:64px}@media(max-width:1024px){h1{font-size:40px}}@media(max-width:767px){h1{font-size:28px}}'});const h=flat(data.content).find(n=>n.widgetType==='heading');
 assert.equal(h.settings.typography_font_size.size,64);assert.equal(h.settings.typography_font_size_tablet.size,40);assert.equal(h.settings.typography_font_size_mobile.size,28);
});
test('CSS cascade follows source specificity and original inline priority',async()=>{
 const data=await convertHtmlToElementorJson({html:'<div id="box" class="box" style="border-color:green"><h2>Title</h2></div>',css:'#box{border-color:red}.box{border-color:blue}h2{color:purple}#box h2{color:red}h2{color:blue}'});
 const h=flat(data.content).find(n=>n.widgetType==='heading');assert.equal(h.settings.title_color,'red');
 const values=[];postcss.parse(data.ecb.css).walkDecls('border-color',d=>values.push(d.value));assert.deepEqual(values,['blue','red','green']);
 assert.deepEqual(specificity(':is(#a,.b) p'),[1,0,1]);
});
test('Hover ancestor selectors and open details remain stateful after wrapper changes',async()=>{
 const data=await convertHtmlToElementorJson({html:'<div class="card"><img src="/a.png"></div><details><summary>Question</summary><p>Answer</p></details>',css:'.card:hover img{opacity:.5}details[open] summary:after{content:"-"}'});
 assert.match(data.ecb.css,/:has\([^)]*:hover\)/);assert.match(data.ecb.css,/\[open\]/);assert.match(data.ecb.css,/:after/);assert.match(data.ecb.css,/content:"-"/);
});
test('Tables, SVGs and unsupported Pro forms retain content instead of disappearing',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'fixtures','compound-elements.html'),'utf8');const data=await convertHtmlToElementorJson({html:html.replace('</body>','<i class="fas fa-house"></i></body>'),edition:'pro'});const all=flat(data.content);const $=cheerio.load(all.filter(n=>n.widgetType==='html').map(n=>n.settings.html).join(''));
 assert.equal($('table td').length,4);assert.equal($('svg').length,2);assert.equal($('picture source').length,1);assert.equal($('form').length,1);assert.match(data.ecb.fallbacks.find(x=>x.tag==='form').reason,/action URL/);
 assert.equal(all.filter(n=>n.widgetType==='icon').length,1);
});
test('Media, dependencies and revision IDs are explicit and deterministic',async()=>{
 const input={html:'<link rel="stylesheet" href="https://example.com/icons.css"><script src="missing.js"></script><img src="images/a.png" alt="House">',mediaPrefix:'/uploads/'};
 const a=await convertHtmlToElementorJson(input),b=await convertHtmlToElementorJson(input),c=await convertHtmlToElementorJson({...input,edition:'pro'});
 assert.equal(a.ecb.assetId,b.ecb.assetId);assert.notEqual(a.ecb.assetId,c.ecb.assetId);assert.equal(a.ecb.unresolvedDependencies.length,2);assert.equal(a.ecb.imageDetails[0].resolvedSrc,'/uploads/a.png');
 assert.equal(Object.values(a.ecb.imageAttributes)[0].alt,'House');
});
test('Unsupported source attributes remain in HTML and native wrappers do not duplicate anchors',async()=>{
 const data=await convertHtmlToElementorJson({html:'<section hidden data-mode="x"><p>Hidden</p></section><p id="contact">Visible</p>'});const all=flat(data.content);const preserved=all.find(n=>n.widgetType==='html');assert.match(preserved.settings.html,/hidden/);
 const p=all.find(n=>n.widgetType==='text-editor');assert.equal(p.settings._element_id,undefined);assert.match(p.settings.editor,/id="contact"/);
});

test('Source flex defaults stay horizontal; explicitly vertical sections retain their direction',async()=>{
 const data=await convertHtmlToElementorJson({...source,edition:'free'});
 assert.equal(findClass(data,'nav').settings.flex_direction,'row');
 assert.equal(findClass(data,'hero-copy').settings.flex_direction,'column');
 assert.equal(findClass(data,'nav').settings.flex_wrap,'nowrap');
});
test('Timeline pseudo-element offsets are never moved onto the whole text widget',async()=>{
 const data=await convertHtmlToElementorJson({html:'<div class="dot">Step</div>',css:'.dot{position:relative}.dot:before{content:"";position:absolute;top:7px;left:50%;width:13px;margin-left:-6.5px}'});
 const rules=[];postcss.parse(data.ecb.css).walkRules(r=>r.nodes.forEach(d=>{if(d.prop==='top'&&d.value==='7px'||d.prop==='position'&&d.value==='absolute'||d.prop==='margin-left')rules.push(r.selector);}));
 assert.equal(rules.length,3);assert(rules.every(s=>s.endsWith(':before')));
});
test('Authored heading margins stay on the heading and stretched column buttons fill the available width',async()=>{
 const data=await convertHtmlToElementorJson({html:'<section class="column"><h2>Title</h2><a class="btn" href="#go">Go</a></section>',css:'.column{display:flex;flex-direction:column}h2{margin:8px 0 12px}'});
 const rules=[];postcss.parse(data.ecb.css).walkRules(r=>{if(r.nodes.some(d=>d.prop==='margin'&&d.value==='8px 0 12px'))rules.push(r.selector)});
 assert(rules[0].includes('.elementor-heading-title'));assert.match(data.ecb.css,/\.elementor-button\{width:100%;\}/);
});
test('Body state attributes survive conversion and dynamic SVG CSS is retained',async()=>{
 const data=await convertHtmlToElementorJson({html:'<!doctype html><html lang="en"><body data-cardimg="on"><div class="host"></div></body></html>',css:'body[data-cardimg="on"] .host{min-height:120px}.host svg{width:30px}'});
 assert.equal(data.ecb.rootAttributes['data-cardimg'],'on');assert.match(data.ecb.css,/min-height:120px/);assert.match(data.ecb.css,/\.host svg\{width:30px\}/);
});
test('Lucide placeholders become SVG before selector matching, with no source script execution',async()=>{
 const data=await convertHtmlToElementorJson({html:'<div class="icons"><i data-lucide="house"></i><i data-lucide="building-2"></i></div>',css:'.icons svg{width:30px;height:30px}',js:'throw new Error("must not execute during conversion"); lucide.createIcons();'});
 const html=flat(data.content).filter(n=>n.widgetType==='html').map(n=>n.settings.html).join('');const $=cheerio.load(html);
 assert.equal($('svg').length,2);assert($('path').length>=3);assert.deepEqual(data.ecb.builtinAssets,['lucide']);assert.equal(data.ecb.unresolvedDependencies.length,0);assert.match(data.ecb.css,/width:30px/);
});
test('Unknown Lucide icons are explicitly reported as unresolved',async()=>{
 const data=await convertHtmlToElementorJson({html:'<i data-lucide="not-a-real-icon-9283"></i>'});
 assert.deepEqual(data.ecb.unresolvedDependencies,[{type:'icon',url:'lucide:not-a-real-icon-9283'}]);
});
