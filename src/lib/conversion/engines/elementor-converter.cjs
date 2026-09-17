'use strict';
const cheerio = require('cheerio');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const crypto = require('crypto');
const { icons: lucideIcons } = require('lucide');
const { scopeCss, resolveMediaUrl } = require('./converter.cjs');
const REVISION = '1.4.0';
const CONTAINERS = new Set('div section article header footer nav main aside'.split(' '));
const INLINE = new Set('a abbr b bdi bdo br cite code del em i ins kbd mark q s samp small span strong sub sup time u var wbr'.split(' '));
const DYNAMIC = new Set([':hover', ':focus', ':focus-within', ':focus-visible', ':active', ':visited', ':target', ':checked', ':disabled', ':enabled', ':valid', ':invalid', ':placeholder-shown', ':open']);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const size = value => { const m=String(value).trim().match(/^(-?(?:\d*\.)?\d+)(px|%|em|rem|vh|vw)?$/);return m?{unit:m[2]||'px',size:Number(m[1]),sizes:[]}:null; };
function dimensions(value) {
  const values=value.trim().split(/\s+/).map(size);if(!values.length||values.length>4||values.some(v=>!v)||new Set(values.map(v=>v.unit)).size!==1)return null;
  const [a,b=a,c=a,d=b]=values;return {unit:a.unit,top:String(a.size),right:String(b.size),bottom:String(c.size),left:String(d.size),isLinked:false};
}
function cssUrls(css,prefix) {return css.replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi,(all,q,a,b)=>{const old=a===undefined?b.trim():a;const next=resolveMediaUrl(old,prefix);return old===next?all:`url(${JSON.stringify(next)})`;});}
function specificity(selector) {
  let score=[0,0,0];
  function add(nodes) {const s=[0,0,0];for(const n of nodes){if(n.type==='id')s[0]++;else if(['class','attribute'].includes(n.type))s[1]++;else if(n.type==='tag')s[2]++;else if(n.type==='pseudo'){if(n.value.startsWith('::')||[':before',':after',':first-line',':first-letter'].includes(n.value))s[2]++;else if(n.value!==':where'){if([':is',':not',':has'].includes(n.value)&&n.nodes){const all=n.nodes.map(x=>add(x.nodes));all.sort(compare);const m=all.pop()||[0,0,0];m.forEach((v,i)=>s[i]+=v);}else{s[1]++;}}}}return s;}
  selectorParser(s=>{score=add(s.first.nodes);}).processSync(selector);return score;
}
function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)-(b[i]||0);}return 0;}
function widgetStats(elements) {const counts={};let total=0;const walk=nodes=>nodes.forEach(n=>{const key=n.elType==='container'?'container':n.widgetType;counts[key]=(counts[key]||0)+1;total++;walk(n.elements||[]);});walk(elements);return {...counts,total};}
async function convertHtmlToElementorJson({html,css='',js='',title='Converted Page',mediaPrefix='',edition='free'}) {
  if(typeof html!=='string'||!html.trim())throw new Error('HTML input is required.');
  if(!['free','pro'].includes(edition))throw new Error('Choose Elementor Free or Pro.');
  if([css,js,title,mediaPrefix].some(v=>typeof v!=='string'))throw new Error('CSS, JS, title and media URL must be text.');
  const $=cheerio.load(html,{scriptingEnabled:false});
  const warnings=[],fallbacks=[],unresolvedDependencies=[],imageDetails=[],imageAttributes={};const unmatchedSelectors=new Set();
  const sourceCss=[$('style').toArray().map(n=>$(n).html()||'').join('\n'),css].filter(Boolean).join('\n');
  const executable=n=>!n.attribs.type||/^(?:text|application)\/javascript$/i.test(n.attribs.type);
  if($('script[type="module"]').length)throw new Error('Module applications require a rendered static HTML export or a classic-script build.');
  const assetJs=[$('script:not([src])').toArray().filter(executable).map(n=>$(n).html()||'').join('\n'),js].filter(Boolean).join('\n');
  $('link[rel="stylesheet"][href]').each((_,n)=>{if(!css.trim()||/^(https?:)?\/\//.test(n.attribs.href))unresolvedDependencies.push({type:'stylesheet',url:n.attribs.href});});
  $('script[src]').each((_,n)=>{if(!js.trim()||/^(https?:)?\/\//.test(n.attribs.src))unresolvedDependencies.push({type:'script',url:n.attribs.src});});
  postcss.parse(sourceCss).walkAtRules('import',r=>unresolvedDependencies.push({type:'css-import',url:r.params}));
  const builtinAssets=[];
  const iconNodes=$('[data-lucide]').toArray();
  const sourceStroke=assetJs.match(/['"]stroke-width['"]\s*:\s*([0-9]+(?:\.[0-9]+)?)/)?.[1]||'2';
  if(iconNodes.length||/\blucide\s*\.\s*createIcons/.test(assetJs))builtinAssets.push('lucide');
  // Materialize declared icons before matching CSS. No source JavaScript is executed.
  for(const node of iconNodes){
    const name=node.attribs['data-lucide'];const key=name.replace(/(^|-)([a-z0-9])/g,(_,dash,c)=>c.toUpperCase());const paths=lucideIcons[key];
    if(!Array.isArray(paths)){unresolvedDependencies.push({type:'icon',url:'lucide:'+name});continue;}
    const attrs={xmlns:'http://www.w3.org/2000/svg',width:'24',height:'24',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':sourceStroke,'stroke-linecap':'round','stroke-linejoin':'round',...node.attribs,class:((node.attribs.class||'')+' lucide lucide-'+name).trim()};
    const xml=attrs=>Object.entries(attrs).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('');
    const svg=$('<svg'+xml(attrs)+'>'+paths.map(([tag,attrs])=>'<'+tag+xml(attrs)+'></'+tag+'>').join('')+'</svg>');$(node).replaceWith(svg);
  }
  if(iconNodes.length)warnings.push('Declared Lucide icons are preserved as static SVG markup for editor visibility. The bundled Lucide runtime supports additional frontend icon initialization.');
  // The recognized dependency is supplied by the runtime, not by a remote CDN.
  for(let i=unresolvedDependencies.length-1;i>=0;i--)if(unresolvedDependencies[i].type==='script'&&/^https?:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net)\/(?:npm\/)?lucide(?:@|\/|$)/.test(unresolvedDependencies[i].url)){builtinAssets.push('lucide');unresolvedDependencies.splice(i,1);}
  // JSON-LD, hydration data and template script nodes must never be concatenated
  // into executable JS. Keep their exact typed markup in an HTML fallback.
  $('head script').toArray().filter(n=>!executable(n)).forEach(n=>$('body').append(n));
  $('script').toArray().filter(executable).forEach(n=>$(n).remove());$('style,link').remove();$('head').empty();
  if(assetJs.trim()&&!$('body').clone().find('script').remove().end().text().trim()&&!$('body').find('img,svg,form,table,video,audio').length)warnings.push('No static content was found in this script-driven shell. Supply rendered HTML to obtain editable native content; the converter does not execute the application.');
  const assetId='ecb-'+crypto.createHash('sha256').update(JSON.stringify([REVISION,html,css,js,mediaPrefix,edition])).digest('hex').slice(0,16);
  const scope='.'+assetId;
  const root=$('<div></div>').attr('class',`ecb-scope ${assetId} ${[$('html').attr('class'),$('body').attr('class')].filter(Boolean).join(' ')}`);
  for(const n of [$('html')[0],$('body')[0]])for(const [key,value]of Object.entries(n.attribs))if(['id','lang','dir'].includes(key)||/^(data-|aria-)/.test(key))root.attr(key,value);
  root.append($('body').contents());$('body').append(root);
  let count=0;const meta=new Map(),inline=[];
  root.find('*').addBack().each((_,n)=>{
    const originalClasses=n.attribs.class||'';const id=crypto.createHash('sha256').update(assetId+':'+count++).digest('hex').slice(0,8);const cls='ecb-n-'+id;
    meta.set(n,{id,cls,originalClasses,node:n,target:null,widget:null,ruleValues:new Map()});
    $(n).addClass(cls);
    for(const key of Object.keys(n.attribs))if(/^on/i.test(key)){warnings.push('Inline event handlers were removed; move their behavior into the JS input.');$(n).removeAttr(key);}
    if(n.attribs.style){inline.push({node:n,value:cssUrls(n.attribs.style,mediaPrefix)});$(n).removeAttr('style');}
    if(n.name==='img'){
      const old=n.attribs.src||'';n.attribs.src=resolveMediaUrl(old,mediaPrefix);imageDetails.push({originalSrc:old,resolvedSrc:n.attribs.src,filename:old.split('/').pop(),alt:n.attribs.alt||''});
      if(n.attribs.srcset)warnings.push('Images with srcset are retained as HTML to preserve responsive image sources.');
    }
  });
  // Move original document inline styles onto the synthetic document root.
  for(const n of [$('html')[0],$('body')[0]])if(n.attribs.style)inline.push({node:root[0],value:cssUrls(n.attribs.style,mediaPrefix)});
  const zero={unit:'px',top:'0',right:'0',bottom:'0',left:'0',isLinked:true};
  function common(n){const m=meta.get(n);const s={_css_classes:$(n).attr('class')||m.cls};if(n.attribs.id)s._element_id=n.attribs.id;return s;}
  function make(n,type,settings={}){const m=meta.get(n);const item={id:m.id,elType:type==='container'?'container':'widget',isInner:false,settings:{...common(n),...settings},elements:[]};if(type!=='container')item.widgetType=type;else{item.settings.css_classes=item.settings._css_classes;delete item.settings._css_classes;}m.widget=item;if(type!=='container')m.wrapper=`${scope} .elementor-element.${m.cls}`;return item;}
  function markInside(n,target){const m=meta.get(n);m.target=target;$(n).find('*').each((_,child)=>{meta.get(child).target=`${scope} .${meta.get(child).cls}`;});}
  function raw(n,reason){fallbacks.push({tag:n.name,id:n.attribs.id||null,reason});const item=make(n,'html',{html:$.html(n)});delete item.settings._element_id;markInside(n,`${scope} .${meta.get(n).cls} .${meta.get(n).cls}`);return item;}
  function simpleInline(n){return $(n).find('*').toArray().every(c=>INLINE.has(c.name));}
  function convertForm(n){
    if(edition!=='pro')return raw(n,'Native Form widget requires Elementor Pro; form HTML is preserved.');
    if(n.attribs.action)return raw(n,'Source form has an action URL; preserve its handler instead of replacing it with a Pro action.');
    const fields=$(n).find('input,textarea,select').toArray();
    const supported=new Set(['text','email','tel','url','textarea','hidden','number']);
    if(!fields.length||fields.some(f=>!supported.has(f.name==='textarea'?'textarea':f.name==='select'?'select':f.attribs.type||'text')||f.attribs.disabled!==undefined||f.attribs.readonly!==undefined)||$(n).find('fieldset,select').length)return raw(n,'This form uses fields or behavior outside the native form mapping.');
    const formFields=fields.map((f,i)=>({_id:meta.get(f).id,custom_id:'field_'+meta.get(f).id,field_type:f.name==='textarea'?'textarea':f.attribs.type||'text',field_label:$(n).find('label').toArray().filter(l=>l.attribs.for===f.attribs.id).map(l=>$(l).text()).join('')||f.attribs.placeholder||f.attribs.name||'Field '+(i+1),placeholder:f.attribs.placeholder||'',field_value:f.name==='textarea'?$(f).text():f.attribs.value||'',required:f.attribs.required!==undefined?'true':'',width:'100'}));
    const submit=$(n).find('button,input[type="submit"]').first();
    const item=make(n,'form',{form_name:title+' form',form_fields:formFields,show_labels:$(n).find('label').length?'yes':'',button_text:submit.text()||submit.attr('value')||'Send',submit_actions:[],button_width:'100'});
    const base=`${scope} .${meta.get(n).cls}`;meta.get(n).target=base+' .elementor-form';
    fields.forEach((f,i)=>{const m=meta.get(f);m.target=base+' .elementor-field-group-'+formFields[i].custom_id+' .elementor-field';m.layoutTarget=base+' .elementor-field-group-'+formFields[i].custom_id;});
    $(n).find('*').each((_,child)=>{const m=meta.get(child);if(m.target)return;if(child.name==='button')m.target=base+' .elementor-button';else if(child.name==='label'){const index=fields.findIndex(f=>f.attribs.id===child.attribs.for);m.target=index<0?base+' .elementor-field-label':base+' .elementor-field-group-'+formFields[index].custom_id+' label';}else if(CONTAINERS.has(child.name))m.target=base+' .elementor-form-fields-wrapper';else m.target=base+' .elementor-form';});
    warnings.push('Pro form fields are editable. Configure Actions After Submit in Elementor; no email recipient or delivery action is installed. Native form markup differs from the source, so review its layout.');
    return item;
  }
  function convert(n){
    if(n.type==='text'){if(!n.data.trim())return null;const span=$('<span></span>').text(n.data)[0];const id=crypto.createHash('sha256').update(assetId+':text:'+count++).digest('hex').slice(0,8);return {id,elType:'widget',widgetType:'text-editor',isInner:false,settings:{editor:$.html(span),_css_classes:'ecb-text-fragment'},elements:[]};}
    if(n.type==='script')return raw(n,'Non-executable script data is preserved without running it.');
    if(n.type!=='tag')return null;
    const m=meta.get(n),base=`${scope} .${m.cls}`;
    if(n!==root[0]&&(CONTAINERS.has(n.name)||/^h[1-6]$/.test(n.name))&&Object.keys(n.attribs).some(k=>!['class','id'].includes(k)))return raw(n,'Element attributes require exact source markup.');
    if(n.name==='form')return convertForm(n);
    // Preserve behavior-bearing attributes instead of silently turning real
    // form/action buttons into links or losing product/filter metadata.
    if(n.name==='button'&&Object.keys(n.attribs).some(k=>!['class','id'].includes(k)))return raw(n,'Button behavior/attributes require source HTML.');
    if(n.name==='a'&&Object.keys(n.attribs).some(k=>!['class','id','href','target'].includes(k)))return raw(n,'Link attributes require source HTML.');
    if(n.name==='i'&&!$(n).text().trim()&&Object.keys(n.attribs).some(k=>k.startsWith('data-')))return raw(n,'Icon placeholder requires its supplied JavaScript/icon library.');
    if(/^h[1-6]$/.test(n.name)&&simpleInline(n)){const item=make(n,'heading',{title:$(n).html(),header_size:n.name,size:'default'});markInside(n,base+' .elementor-heading-title');return item;}
    if(n.name==='img'){
      if(Object.keys(n.attribs).some(k=>!['src','alt','class','id'].includes(k)))return raw(n,'Image attributes require exact source HTML.');
      const item=make(n,'image',{image:{url:n.attribs.src||'',id:'',alt:n.attribs.alt||''},image_size:'full',caption_source:'none',link_to:'none'});m.target=base+' img';imageAttributes[m.cls]={url:n.attribs.src||'',alt:n.attribs.alt||''};return item;
    }
    if(n.name==='a'&&$(n).children().length===1&&$(n).children().first()[0].name==='img'&&!$(n).clone().children().remove().end().text().trim()){
      const img=$(n).children().first()[0];const item=convert(img);if(item.widgetType==='image'){item.settings._css_classes+=' '+m.cls+' '+m.originalClasses;item.settings.link_to='custom';item.settings.link={url:n.attribs.href||'',is_external:n.attribs.target==='_blank'?'on':'',nofollow:/nofollow/.test(n.attribs.rel||'')?'on':''};if(n.attribs.id)item.settings._element_id=n.attribs.id;m.target=`${scope} .${meta.get(img).cls} a`;m.wrapper=meta.get(img).wrapper;return item;}return raw(n,'Linked responsive image requires source HTML.');
    }
    if((n.name==='a'&&/(^|\s)(btn|button|cta)(\s|$)/i.test(m.originalClasses)||n.name==='button')&&$(n).children().length===0){const item=make(n,'button',{text:$(n).text(),link:{url:n.attribs.href||'',is_external:n.attribs.target==='_blank'?'on':''},size:'sm'});m.target=base+' .elementor-button';return item;}
    if(n.name==='i'&&!$(n).text().trim()&&/\bfa[srb]?\b/.test(m.originalClasses)&&/\bfa-[\w-]+/.test(m.originalClasses)){const lib=/\bfab\b/.test(m.originalClasses)?'fa-brands':/\bfar\b/.test(m.originalClasses)?'fa-regular':'fa-solid';const value=m.originalClasses.replace(/\bfa\b/,'fas');const item=make(n,'icon',{selected_icon:{value,library:lib},view:'default'});m.target=base+' i';return item;}
    if(n!==root[0]&&(INLINE.has(n.name)||['p','blockquote','ul','ol'].includes(n.name)||n.name==='div'&&simpleInline(n)&&$(n).text().trim())){
      if($(n).find('svg,form,table,img,iframe').length||$(n).find('i,span').toArray().some(c=>!$(c).text().trim()&&c.attribs.class))return raw(n,'Rich text contains markup that native text editing may sanitize.');
      const item=make(n,'text-editor',{editor:$.html(n)});delete item.settings._element_id;markInside(n,base+' .'+m.cls);return item;
    }
    if(CONTAINERS.has(n.name)){
      const item=make(n,'container',{content_width:'full',html_tag:n.name,container_type:'flex',flex_direction:'row',flex_wrap:'nowrap',flex_gap:{unit:'px',row:'0',column:'0',isLinked:true},padding:{...zero},margin:{...zero}});m.target=n===root[0]?scope:base;item.elements=$(n).contents().toArray().map(convert).filter(Boolean);return item;
    }
    return raw(n,'No lossless native widget mapping in this release; source HTML is preserved.');
  }
  const content=[convert(root[0])];
  // Matching happens against source DOM, so generated Elementor wrappers do not
  // break child, tag, sibling or structural selectors. State selectors are
  // rebuilt against their mapped ancestors rather than flattened.
  function matches(selector){
    const ast=selectorParser().astSync(selector).first;const pseudoElements=[];let state=false;let unsupported=false;
    const isState=n=>n.type==='class'&&['active','is-active','current','current-menu-item','current_page_item'].includes(n.value)||n.type==='pseudo'&&DYNAMIC.has(n.value)||n.type==='attribute'&&['open','checked','disabled','aria-expanded','aria-selected','aria-current','hidden'].includes(n.attribute);
    ast.walkClasses(c=>{if(isState(c)){if(c.parent!==ast)unsupported=true;else state=true;}});
    ast.walkAttributes(a=>{if(isState(a)){if(a.parent!==ast)unsupported=true;else state=true;}});
    ast.walkPseudos(p=>{if(p.value.startsWith('::')||[':before',':after',':first-letter',':first-line'].includes(p.value)){if(p.parent!==ast){unsupported=true;return;}pseudoElements.push(p.toString());p.remove();}else if(DYNAMIC.has(p.value)){if(p.parent!==ast){unsupported=true;return;}state=true;}});
    if(unsupported)throw new Error('State or pseudo-element inside a functional selector is not supported: '+selector);
    const compounds=[];let current=[],relation=' ';
    for(const node of ast.nodes){if(node.type==='combinator'){compounds.push({nodes:current,relation});current=[];relation=node.value.trim()||' ';}else current.push(node);}
    compounds.push({nodes:current,relation});
    const staticSelector=ast.clone();staticSelector.walk(n=>{if(isState(n))n.remove();});
    const query=staticSelector.toString().trim()||'*';let nodes;
    try{nodes=$(query).toArray().filter(n=>meta.has(n));}catch(e){throw new Error('Unsupported CSS selector '+selector+': '+e.message);}
    function matchCompound(n,c){const text=c.nodes.filter(x=>!isState(x)).map(x=>x.toString()).join('')||'*';return $(n).is(text);}
    function chain(n,i){if(!n||!matchCompound(n,compounds[i]))return [];if(i===0)return [[n]];const relation=compounds[i].relation;let candidates=[];
      if(relation==='>')candidates=[$(n).parent()[0]];else if(relation==='+')candidates=[$(n).prev()[0]];else if(relation==='~')candidates=$(n).prevAll().toArray();else candidates=$(n).parents().toArray();
      return candidates.filter(Boolean).flatMap(p=>chain(p,i-1).map(c=>[...c,n]));}
    if(!nodes.length)unmatchedSelectors.add(selector);
    return nodes.flatMap(n=>{const m=meta.get(n);if(!m.target)return [];if(!state)return [{node:n,target:m.target+pseudoElements.join(''),state:false}];return chain(n,compounds.length-1).map(path=>{let gates=scope;let gated=false;path.forEach((p,i)=>{const states=compounds[i].nodes.filter(isState).map(x=>x.toString()).join('');if(states&&i<path.length-1&&meta.get(p)?.target){const t=meta.get(p).target;if(t===scope)gates+=states;else gates+=':has('+t.replace(scope+' ','')+states+')';gated=true;}});const lastStates=compounds.at(-1).nodes.filter(isState).map(x=>x.toString()).join('');const target=gated?gates+' '+m.target.replace(scope+' ',''):m.target;return {node:n,target:target+lastStates+pseudoElements.join(''),state:true};});});
  }
  const parsed=postcss.parse(scopeCss(cssUrls(sourceCss,mediaPrefix),scope));let order=0;const records=[];
  function capture(rule,inlinePriority=false){let keyframe=false;const contexts=[];for(let p=rule.parent;p;p=p.parent){if(p.type==='atrule'){if(/keyframes$/i.test(p.name))keyframe=true;contexts.unshift({name:p.name,params:p.params});}}if(keyframe)return;
    const selectors=selectorParser().astSync(rule.selector).nodes.map(n=>n.toString());
    selectors.forEach(selector=>{const matched=matches(selector),spec=specificity(selector);rule.nodes.filter(n=>n.type==='decl').forEach(decl=>matched.forEach(match=>{
      const record={...match,prop:decl.prop,value:decl.value,important:!!decl.important,contexts,rank:[decl.important?1:0,inlinePriority?1:0,...spec,order++],native:false};records.push(record);
    }));});
  }
  parsed.walkRules(r=>capture(r));
  for(const entry of inline){const r=postcss.parse('x{'+entry.value+'}').first;if(!r||r.type!=='rule'||r.nodes.some(n=>!['decl','comment'].includes(n.type)))throw new Error('Invalid inline CSS.');r.selector='.'+meta.get(entry.node).cls;capture(r,true);}
  function device(contexts){if(!contexts.length)return '';if(contexts.length!==1||contexts[0].name!=='media')return null;const q=contexts[0].params.replace(/\s/g,'').toLowerCase();return q==='(max-width:767px)'?'_mobile':q==='(max-width:1024px)'?'_tablet':null;}
  const candidates=new Map();
  for(const r of records){const suffix=device(r.contexts);if(r.state||r.important||suffix===null||r.target!==meta.get(r.node).target)continue;const key=meta.get(r.node).id+suffix+':'+r.prop;const old=candidates.get(key);if(!old||compare(old.rank,r.rank)<0)candidates.set(key,r);}
  const transferred=new Set();
  for(const m of meta.values()){
    const background=candidates.get(m.id+':background-image')||candidates.get(m.id+':background');
    if(background&&/url\(/.test(background.value)&&!$(m.node).text().trim()&&!$(m.node).children().length&&!['height','min-height','aspect-ratio','padding','padding-top','padding-bottom'].some(p=>records.some(r=>r.node===m.node&&r.prop===p))){warnings.push('An empty background-image element has no source height or aspect ratio and may collapse: '+(m.originalClasses||m.node.name)+'. Supply its missing layout CSS or check its parent stretch layout.');}
  }

  for(const m of meta.values())if(m.widget?.elType==='container'){
    const display=candidates.get(m.id+':display')?.value.trim();
    if(['grid','flex'].includes(display))m.widget.settings.container_type=display;
    if(display==='grid'){m.widget.settings.grid_columns_grid={unit:'custom',size:'none',sizes:[]};m.widget.settings.grid_rows_grid={unit:'custom',size:'none',sizes:[]};m.widget.settings.grid_gaps={unit:'px',row:'0',column:'0',isLinked:true};}
  }
  function transfer(r){const m=meta.get(r.node),w=m.widget;if(!w||w.widgetType==='html'||w.widgetType==='form')return false;const s=w.settings,suffix=device(r.contexts),v=r.value.trim(),p=r.prop;const container=w.elType==='container',grid=container&&s.container_type==='grid';
    const set=(key,value)=>{s[key+suffix]=value;return true;};
    // Only values faithfully represented by a control leave external CSS.
    if(p==='padding'&&container&&dimensions(v))return set('padding',dimensions(v));
    if(p==='margin'&&container&&dimensions(v))return set('margin',dimensions(v));
    if(container&&p==='display'&&['flex','grid'].includes(v))return suffix===''?set('container_type',v):false;
    if(container&&!grid&&p==='flex-direction'&&['row','column','row-reverse','column-reverse'].includes(v))return set('flex_direction',v);
    if(container&&!grid&&p==='justify-content'&&['flex-start','center','flex-end','space-between','space-around','space-evenly'].includes(v))return set('flex_justify_content',v);
    if(container&&!grid&&p==='align-items'&&['stretch','flex-start','center','flex-end','baseline'].includes(v))return set('flex_align_items',v);
    if(container&&!grid&&p==='flex-wrap'&&['wrap','nowrap'].includes(v))return set('flex_wrap',v);
    if(container&&p==='gap'){const d=v.split(/\s+/).map(size);if(d.length<=2&&d.every(Boolean)&&d.every(x=>x.unit===d[0].unit))return set(grid?'grid_gaps':'flex_gap',{unit:d[0].unit,row:String(d[0].size),column:String((d[1]||d[0]).size),isLinked:d.length===1});}
    if(grid&&['grid-template-columns','grid-template-rows'].includes(p))return set(p==='grid-template-columns'?'grid_columns_grid':'grid_rows_grid',{unit:'custom',size:v,sizes:[]});
    if(grid&&p==='align-items'&&['start','end','center','stretch'].includes(v))return set('grid_align_items',v);
    if(grid&&p==='justify-content'&&['start','end','center','space-between','space-around','space-evenly'].includes(v))return set('grid_justify_content',v);
    if(container&&p==='width'&&size(v))return set('width',size(v));
    if(['heading','text-editor','button'].includes(w.widgetType)){
      if(p==='color'&&!/var\(|inherit|initial|revert|unset/.test(v)&&suffix==='')return set(w.widgetType==='heading'?'title_color':w.widgetType==='button'?'button_text_color':'text_color',v);
      const typo={'font-size':'font_size','font-weight':'font_weight','line-height':'line_height','letter-spacing':'letter_spacing','text-transform':'text_transform','font-style':'font_style','text-decoration':'text_decoration'};
      if(typo[p]){let value=v;if(['font-size','line-height','letter-spacing'].includes(p)){value=size(v);if(!value)return false;if(p==='line-height'&&/^[\d.]+$/.test(v))value.unit='em';}else if(/var\(|inherit|initial|revert|unset/.test(v))return false;s.typography_typography='custom';return set('typography_'+typo[p],value);}
      if(p==='text-align'&&['left','right','center','justify','start','end'].includes(v))return set('align',v);
    }
    return false;
  }
  // Partial shorthand overrides stay together in CSS to preserve the cascade.
  for(const [key,r]of candidates){const family=r.prop==='padding'||r.prop==='margin'?r.prop:null;const conflicts=(family&&records.some(x=>x.node===r.node&&x.prop.startsWith(family+'-')))||(/^font-|^line-height$/.test(r.prop)&&records.some(x=>x.node===r.node&&x.prop==='font'));
    if(!conflicts&&transfer(r))transferred.add(key);
  }
  // Native widgets introduce wrappers with theme typography. Seed their local
  // typography from source inheritance so wrappers do not replace parent styles.
  function inherited(n,prop,depth=0){
    if(!n||depth>64)return null;const m=meta.get(n);
    const r=m&&candidates.get(m.id+':'+prop);
    if(r&&!['inherit','unset'].includes(r.value.trim()))return {value:r.value,node:n};
    return inherited($(n).parent()[0],prop,depth+1);
  }
  for(const m of meta.values())if(['heading','text-editor','button'].includes(m.widget?.widgetType)){
    const s=m.widget.settings;
    const map={'font-size':'font_size','font-weight':'font_weight','line-height':'line_height','letter-spacing':'letter_spacing'};
    for(const [prop,key]of Object.entries(map))if(s['typography_'+key]===undefined){
      const found=inherited(m.node,prop)||(['text-editor','button'].includes(m.widget.widgetType)&&prop==='font-size'?{value:'16px',node:root[0]}:null);if(!found)continue;let value=found.value.trim();
      if(['font-size','line-height','letter-spacing'].includes(prop)){const parsedSize=size(value);if(!parsedSize)continue;if(prop==='font-size'&&found.node!==m.node&&['em','%'].includes(parsedSize.unit)){parsedSize.size=100;parsedSize.unit='%';}if(prop==='line-height'&&/^[\d.]+$/.test(value))parsedSize.unit='em';value=parsedSize;}
      else if(!/^(normal|bold|[1-9]00)$/.test(value))continue;
      s.typography_typography='custom';s['typography_'+key]=value;
    }
    const family=inherited(m.node,'font-family');
    if(family&&!/var\(|inherit|initial|unset|revert/.test(family.value)){
      const first=family.value.trim().match(/^(?:["']([^"']+)["']|([^,]+))/);
      if(first){s.typography_typography='custom';s.typography_font_family=(first[1]||first[2]).trim();}
    }
  }
  const output=postcss.root();const rootMeta=meta.get(root[0]);const fullDocument=/<body\b/i.test(html);
  const baseline=`${scope}.ecb-scope{margin:0;padding:0;max-width:none;color:#000;font-family:Times New Roman,serif;font-size:16px;line-height:normal;font-weight:400;}\n:where(${scope}) :where(.e-con){--container-widget-width:100%;--container-widget-flex-grow:0;--container-widget-align-self:initial;--content-width:100%;min-width:0;}\n${scope} .elementor-widget{margin-block-end:0;min-width:0;width:auto;}\n:where(${scope}) :where(.elementor-heading-title){padding:0;}\n${scope} .elementor-widget-html,${scope} .elementor-widget-html>.elementor-widget-container{display:contents;}\n:where(${scope}) :where(.elementor-form .elementor-field-type-submit){grid-column:1 / -1;}\n`;
  output.append(postcss.parse(baseline));
  output.append(postcss.parse(`${scope} .elementor-widget-html figure,${scope} .elementor-widget-html blockquote{margin:1em 40px;}`));
  parsed.walkRules(rule=>{const selectors=selectorParser().astSync(rule.selector).nodes.map(n=>n.toString()).filter(x=>unmatchedSelectors.has(x));if(selectors.length) {let copy=rule.clone({selector:selectors.join(',')});for(let p=rule.parent;p&&p.type!=='root';p=p.parent)copy=p.clone({nodes:[copy]});output.append(copy);}});
  // Elementor's own typography and flex-item defaults must not replace source inheritance.
  output.append(postcss.parse(`${scope} .elementor-widget{font-family:inherit;font-size:inherit;font-weight:inherit;line-height:inherit;color:inherit;flex-grow:0;flex-shrink:1;align-self:auto;}
:where(${scope}) .e-con{--width:auto;--flex-grow:0;--flex-shrink:1;}
${scope}.ecb-scope :is(h1,h2,h3,h4,h5,h6){color:inherit;}
${scope} .elementor-widget-heading .elementor-heading-title{color:inherit;}
${scope} .elementor-widget-button .elementor-button{color:inherit;}
${scope} .elementor-widget-button{display:inline-flex;vertical-align:middle;width:fit-content;}
${scope} .elementor-widget-button .elementor-button-wrapper{display:contents;}
`));
  for(const m of meta.values())if(m.widget?.widgetType==='heading'){
    const defaults={h1:['2em','.67em'],h2:['1.5em','.83em'],h3:['1.17em','1em'],h4:['1em','1.33em'],h5:['.83em','1.67em'],h6:['.67em','2.33em']}[m.node.name];
    output.append(postcss.parse(`:where(${scope}) .${m.cls} .elementor-heading-title{margin:${defaults[1]} 0;}`));
    if(!candidates.has(m.id+':font-size'))output.append(postcss.parse(`:where(${scope}) .${m.cls} .elementor-heading-title{font-size:${defaults[0]};}`));
  }
  for(const m of meta.values())if(m.widget?.widgetType==='button'){
    const parent=meta.get($(m.node).parent()[0]);const display=parent&&candidates.get(parent.id+':display')?.value;
    const direction=parent&&candidates.get(parent.id+':flex-direction')?.value;const align=parent&&candidates.get(parent.id+':align-items')?.value;
    if(display==='flex'&&direction==='column'&&(!align||align==='stretch'))output.append(postcss.parse(`${m.wrapper}{width:auto;align-self:stretch;}
${m.target}{width:100%;}
`));
  }

  // Copy non-rule at-rules (font-face/keyframes), retaining enclosing contexts.
  function copySpecial(nodes,dest){for(const n of nodes){if(n.type==='atrule'&&(!n.nodes||/keyframes$/i.test(n.name)||n.name==='font-face'))dest.append(n.clone());else if(n.type==='atrule'){const c=n.clone({nodes:[]});copySpecial(n.nodes,c);if(c.nodes.length)dest.append(c);}}}copySpecial(parsed.nodes,output);
  let nativeDeclarations=0;
  for(const r of [...records].sort((a,b)=>compare(a.rank,b.rank))){const m=meta.get(r.node),suffix=device(r.contexts),key=m.id+suffix+':'+r.prop;
    if(!r.state&&!r.important&&suffix!==null&&transferred.has(key)&&r.target===m.target){nativeDeclarations++;continue;}
    let target=r.target;
    if(m.layoutTarget&&/^(grid-|align-self|order$)/.test(r.prop))target=m.layoutTarget;
    else if(r.target===m.target&&m.wrapper&&m.widget?.widgetType!=='html'&&/^(position|inset(?:-.+)?|top|right|bottom|left|z-index|order|align-self|flex(?:-.+)?|grid-(?:column|row)(?:-.+)?)$/.test(r.prop))target=m.wrapper;
    const imageDimension=r.target===m.target&&m.widget?.widgetType==='image'&&['width','height'].includes(r.prop);
    if(imageDimension)target=m.wrapper;
    const pseudo=target.match(/(::?[a-z-]+(?:\([^)]*\))?)$/i);
    const ending=pseudo&&(/^::/.test(pseudo[1])||[':before',':after',':first-letter',':first-line'].includes(pseudo[1]))?pseudo[1]:'';
    const baseTarget=ending?target.slice(0,-ending.length):target;
    // Equal fallback specificity preserves the source cascade after DOM mapping.
    const weighted=`:where(${baseTarget}):not(#${assetId}-reserved-a):not(#${assetId}-reserved-b)${ending}`;
    const rule=postcss.rule({selector:weighted});rule.append(postcss.decl({prop:r.prop,value:r.value,important:r.important}));
    if(imageDimension){const fill=postcss.rule({selector:m.target});fill.append(postcss.decl({prop:r.prop,value:'100%'}));let nested=fill;for(let i=r.contexts.length-1;i>=0;i--){const at=postcss.atRule(r.contexts[i]);at.append(nested);nested=at;}output.append(nested);if(r.prop==='height'){const inner=postcss.rule({selector:m.wrapper+'>.elementor-widget-container'});inner.append({prop:'height',value:'100%'});let innerNested=inner;for(let i=r.contexts.length-1;i>=0;i--){const at=postcss.atRule(r.contexts[i]);at.append(innerNested);innerNested=at;}output.append(innerNested);}}
    let wrapped=rule;
    for(let i=r.contexts.length-1;i>=0;i--){const ctx=r.contexts[i];const at=postcss.atRule(ctx);at.append(wrapped);wrapped=at;}output.append(wrapped);
  }
  // Neutralize native container flex defaults only for source block layouts.
  for(const m of meta.values())if(m.widget?.elType==='container'){
    const display=candidates.get(m.id+':display');if(!display){output.prepend(postcss.parse(`${m.target}{display:block;}`));}
  }
  // Body spacing belongs to the imported root, even in themes that reset body.
  // Remove its generated zero margin control so the baseline or source CSS wins.
  if(!candidates.has(rootMeta.id+':margin'))delete content[0].settings.margin;
  const assetCss=output.toString();
  if(unmatchedSelectors.size)warnings.push('Some selectors do not match the supplied source DOM. Their scoped rules are retained for dynamic content, but selectors crossing native widget wrappers may still need adaptation; see unmatchedSelectors.');
  if(assetJs.trim())warnings.push('Source JavaScript is loaded on the frontend only. Elementor changes the DOM; adapt selectors and initialization before relying on custom interactions.');
  if(fallbacks.length)warnings.push(`${fallbacks.length} element(s) use Elementor HTML widgets; their content is preserved but edited as HTML.`);
  if(unresolvedDependencies.length)warnings.push('Supply linked styles/scripts/fonts and remove resolved links or @imports before importing.');
  warnings.push('Arbitrary breakpoints and CSS values that cannot map exactly remain in external CSS. These may override Elementor controls at those sizes.');
  const stats=widgetStats(content);const safeTitle=title.trim()||'Converted Page';
  const result={title:safeTitle,type:'page',version:'0.4',page_settings:{template:'elementor_canvas',hide_title:'yes'},content,
    ecb:{format:'elementor-converter-bundle',version:1,converterVersion:REVISION,edition,assetId,builtinAssets:[...new Set(builtinAssets)],css:assetCss,js:assetJs,requiredWidgets:Object.keys(stats).filter(x=>!['total','container'].includes(x)),requiredBreakpoints:{mobile:767,tablet:1024},imageAttributes,rootAttributes:Object.fromEntries(Object.entries(root[0].attribs).filter(([key])=>['lang','dir'].includes(key)||/^(data-|aria-)/.test(key))),unmatchedSelectors:[...unmatchedSelectors],unresolvedDependencies,fallbacks,warnings:[...new Set(warnings)],stats,nativeDeclarations,imageDetails,
      installation:'Install Elementor Converter Runtime and use Tools > Elementor Converter Import. Standard template import does not install the external CSS/JS assets.'}};
  return result;
}
module.exports={convertHtmlToElementorJson,widgetStats,dimensions,specificity};
