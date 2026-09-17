const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const postcss = require('postcss');
const {convertHtmlToGutenbergJson,scopeCss,resolveMediaUrl,validateGutenbergMarkup} = require('../src/lib/conversion/engines/converter.cjs');
const fixture = extension => fs.readFileSync(path.join(__dirname,'fixtures','roof-rangers.'+extension),'utf8');
const options = {html:fixture('html'),css:fixture('css'),js:fixture('js'),title:'Roof Rangers Homepage',mediaPrefix:'/wp-content/uploads/2026/08/'};
function normalize($, node) {
  const attrs = {...node.attribs}; delete attrs.style;
  if (attrs.class) {
    attrs.class = attrs.class.split(/\s+/).filter(c => !/^(?:wp-block-|gcb-inline-)/.test(c)).sort().join(' ');
    if (!attrs.class) delete attrs.class;
  }
  if (node.name === 'img') attrs.src = resolveMediaUrl(attrs.src,options.mediaPrefix);
  return {tag:node.name,attrs:Object.fromEntries(Object.entries(attrs).sort()),children:$(node).children().toArray().map(n => normalize($,n)),text:$(node).clone().children().remove().end().text().replace(/\s+/g,' ').trim()};
}
test('Roof Rangers retains its complete source DOM, content and attributes without layout wrappers',async () => {
  const result=await convertHtmlToGutenbergJson(options);
  const source=cheerio.load(options.html);const converted=cheerio.load(result.content);
  assert.deepEqual(normalize(source,source('.rr-page')[0]),normalize(converted,converted('.rr-page')[0]));
  assert.equal(converted('style,script,[style]').length,0);
  assert.equal(result.meta.sourceInlineCount,4);
  assert.equal(result.summary.blockStats['gcb/image'],17);
  assert.equal(result.summary.blockStats['core/heading'],33);
  assert.equal(result.summary.blockStats['core/paragraph'],30);
  assert.equal(result.summary.blockStats['gcb/markup'],2);
  assert.equal(converted('.hero-photo > img').length,1);
  assert.equal(converted('figure.wp-block-image,.wp-block-buttons,.wp-block-group__inner-container').length,0);
});
test('Every original stylesheet declaration and media query is retained in order',async () => {
  const result=await convertHtmlToGutenbergJson(options);
  const rules = css => { const list=[];postcss.parse(css).walkRules(r=>list.push({decls:r.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value,n.important||false]),media:r.parent.type==='atrule'?r.parent.params:null}));return list; };
  const original=rules(options.css);const actual=rules(result.patternCss);
  assert.deepEqual(actual.slice(1,1+original.length),original);
  assert.equal(actual.length,original.length+1+4);
  assert.equal((result.patternCss.match(/@media/g)||[]).length,2);
  assert.equal(/"layout"\s*:/.test(result.content),false);
});
test('Identical inputs give the same asset ID; CSS revisions give a new ID',async () => {
  const a=await convertHtmlToGutenbergJson(options),b=await convertHtmlToGutenbergJson(options),c=await convertHtmlToGutenbergJson({...options,css:options.css+'\n.rr-page{color:red}'});
  assert.equal(a.patternScopeId,b.patternScopeId);assert.equal(a.content,b.content);assert.notEqual(a.patternScopeId,c.patternScopeId);
});
test('Selector parser preserves functional commas, media rules, font faces and keyframes',() => {
  const input=':root{--x:red}html.dark body{color:var(--x)}@media(max-width:640px){.card:is(.a,.b),a:hover{color:red}}@font-face{font-family:X;src:url(x.woff2)}@keyframes pulse{from{opacity:0}to{opacity:1}}';
  const output=scopeCss(input,'.scope');const parsed=postcss.parse(output);let keyframes;
  parsed.walkAtRules('keyframes',r=>keyframes=r);
  assert.equal(keyframes.nodes[0].selector,'from');assert.match(output,/\.scope\.dark/);assert.match(output,/\.scope \.card:is\(\.a,\.b\)/);
  assert.throws(()=>scopeCss('.parent{& .child{color:red}}','.scope'),/nested CSS/);
});
test('Embedded CSS and JS are retained as external assets, never removed or inlined',async () => {
  const result=await convertHtmlToGutenbergJson({html:'<style>.hero{color:red}</style><div class="hero" style="padding:10px">Hello</div><script>window.example = 1;</script>'});
  assert.match(result.patternCss,/color:red/);assert.match(result.patternCss,/padding:10px/);assert.match(result.patternJs,/window.example = 1/);assert.equal(cheerio.load(result.content)('style,script,[style]').length,0);
});
test('Media relocation is explicit and preserves remote URLs, fragments, data URLs and existing upload paths',() => {
  for(const url of ['https://example.com/a.png?x=1','//example.com/a.png','data:image/png;base64,abc','#icon','/wp-content/uploads/a.png']) assert.equal(resolveMediaUrl(url,'/new/'),url);
  assert.equal(resolveMediaUrl('images/a.png'), 'images/a.png');assert.equal(resolveMediaUrl('images/a.png','/actual/'),'/actual/a.png');
});
test('Missing dependencies are reported; comment injection is escaped; mismatched nesting is rejected',async () => {
  const result=await convertHtmlToGutenbergJson({html:'<link rel="stylesheet" href="missing.css"><script src="missing.js"></script><p class="hello--world">Text</p>'});
  assert.equal(result.manifest.unresolvedDependencies.length,2);assert.equal(result.meta.structuralValidation.isValid,true);
  assert.equal(validateGutenbergMarkup('<!-- wp:group --><!-- wp:paragraph --><!-- /wp:group --><!-- /wp:paragraph -->').isValid,false);
  assert.match(result.content,/hello\\u002d\\u002dworld/);
});

test('Forms, tables, SVG icons and picture sources keep their full markup',async () => {
  const html=fs.readFileSync(path.join(__dirname,'fixtures','compound-elements.html'),'utf8');
  const result=await convertHtmlToGutenbergJson({html});const $=cheerio.load(result.content);
  assert.equal(result.summary.blockStats['core/html'],undefined);
  assert.equal($('svg path').length,1);assert.equal($('svg use').attr('href'),'#clock');
  assert.equal($('table td[rowspan]').text(),'Monday & Tuesday');assert.equal($('td[colspan]').text(),'Closed on holidays');
  assert.equal($('input[required]').length,1);assert.equal($('input[checked]').length,1);assert.equal($('option[selected]').text(),'Roof repair');
  assert.equal($('textarea').text(),'Existing message');assert.equal($('source').attr('srcset'),'/small.webp');
  assert.equal($('a i.fa-phone').length,1);
});
test('Document body spacing is preserved; authored resets override the baseline',async () => {
  const doc=await convertHtmlToGutenbergJson({html:'<!doctype html><html><body><p>Test</p></body></html>',css:'body{margin:0;padding:32px 24px}@media(max-width:600px){body{padding:12px}}'});
  assert.match(doc.patternCss,/margin:0/);assert.match(doc.patternCss,/margin:0;padding:32px 24px/);assert.match(doc.patternCss,/@media\(max-width:600px\)/);
  const fragment=await convertHtmlToGutenbergJson({html:'<p>Test</p>'});assert.match(fragment.patternCss,/margin:0;padding:0/);
});
