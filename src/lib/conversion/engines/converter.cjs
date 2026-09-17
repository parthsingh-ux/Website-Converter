'use strict';

const cheerio = require('cheerio');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const crypto = require('crypto');
const CONVERTER_REVISION = '2.1.0';

const CONTAINERS = new Set('a div section article header footer nav main aside ul ol li figure details table thead tbody tfoot tr td th dl dt dd'.split(' '));
const PHRASING = new Set('a abbr b bdi bdo br cite code del em i ins kbd mark q s samp small span strong sub sup time u var wbr'.split(' '));
const RICH_TAGS = new Set('div p h1 h2 h3 h4 h5 h6 a button span strong b em i small cite blockquote label summary figcaption li dt dd'.split(' '));
// Keep compound HTML atomic: table editing wrappers and RichText sanitization
// must not change form controls, SVG paths, picture sources or cell contents.
const MARKUP_TAGS = new Set('form table svg math picture video audio canvas iframe object embed input textarea select hr'.split(' '));

function cleanMediaUrl(value) {
  return String(value || '').trim().replace(/^(["'])(.*)\1$/, '$2');
}
function cleanFilename(value) {
  return cleanMediaUrl(value).split(/[?#]/)[0].split('/').pop() || '';
}
// An explicit prefix relocates relative assets only; it never uploads files.
function resolveMediaUrl(value, mediaPrefix = '') {
  const url = cleanMediaUrl(value);
  if (!mediaPrefix.trim() || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(url)) return url;
  return `${mediaPrefix.trim().replace(/\/$/, '')}/${cleanFilename(url)}`;
}
function rewriteCssUrls(css, mediaPrefix) {
  return css.replace(/url\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi, (whole, quote, quoted, unquoted) => {
    const original = quoted === undefined ? unquoted.trim() : quoted;
    const resolved = resolveMediaUrl(original, mediaPrefix);
    return resolved === original ? whole : `url(${JSON.stringify(resolved)})`;
  });
}
function scopeCss(cssText, scopeSelector) {
  const root = postcss.parse(cssText || '');
  root.walkRules(rule => {
    for (let p = rule.parent; p; p = p.parent) {
      if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return;
    }
    if (rule.selector.includes('&')) throw new Error('Expand nested CSS before conversion. Flat rules inside @media, @supports and @container are supported.');
    rule.selector = selectorParser(selectors => {
      selectors.each(selector => {
        const isRoot = n => (n.type === 'tag' && /^(html|body)$/i.test(n.value)) || (n.type === 'pseudo' && n.value === ':root');
        selector.walk(n => {
          if (isRoot(n) && n.parent !== selector) throw new Error('Document-root selectors inside functional pseudo-classes must be expanded before conversion.');
        });
        const nodes = selector.nodes;
        if (nodes.some(isRoot)) {
          let end = -1;
          nodes.forEach((n, i) => { if (isRoot(n)) end = i; });
          const head = nodes.slice(0, end + 1);
          if (head.some(n => (n.type === 'combinator' && !/^[\s>]*$/.test(n.value)) || (n.type === 'tag' && !isRoot(n)))) {
            throw new Error(`Unsupported document-root selector: ${selector.toString()}`);
          }
          const extra = head.filter(n => !isRoot(n) && n.type !== 'combinator').map(n => n.toString()).join('');
          const tail = nodes.slice(end + 1).map(n => n.toString()).join('');
          selector.replaceWith(selectorParser().astSync(scopeSelector + extra + tail).first);
        } else {
          selector.replaceWith(selectorParser().astSync(`${scopeSelector} ${selector.toString()}`).first);
        }
      });
    }).processSync(rule.selector);
  });
  return root.toString();
}
function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function serializeCommentAttributes(attributes) {
  return JSON.stringify(attributes).replace(/--/g, '\\u002d\\u002d').replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\\"/g, '\\u0022');
}
function htmlAttrs(attributes) {
  return Object.entries(attributes).filter(([, v]) => v !== false && v != null)
    .map(([k, v]) => ` ${k}="${esc(v === true ? '' : v)}"`).join('');
}
// Portable preview serialization. The importer uses WordPress's installed
// serializer and round-trip validation before saving the actual pattern.
function serializeNode(node) {
  const a = node.attributes || {};
  const children = (node.innerBlocks || []).map(serializeNode).join('');
  const stored = { ...a };
  let markup;
  if (node.name === 'core/html' || node.name === 'gcb/markup') {
    markup = a.content || '';
    if (node.name === 'core/html') delete stored.content;
  } else if (node.name === 'core/heading' || node.name === 'core/paragraph') {
    const tag = node.name === 'core/heading' ? `h${a.level || 2}` : 'p';
    const classes = [node.name === 'core/heading' ? 'wp-block-heading' : '', a.className].filter(Boolean).join(' ');
    markup = `<${tag}${classes ? ` class="${esc(classes)}"` : ''}${a.anchor ? ` id="${esc(a.anchor)}"` : ''}>${a.content || ''}</${tag}>`;
    delete stored.content;
    delete stored.anchor;
  } else {
    const baseClass = `wp-block-${node.name.replace('/', '-')}`;
    const props = { ...(a.htmlAttributes || {}), class: [baseClass, a.className].filter(Boolean).join(' ') };
    const tag = node.name === 'gcb/image' ? 'img' : a.tagName || 'div';
    markup = tag === 'img' ? `<img${htmlAttrs(props)}/>` : `<${tag}${htmlAttrs(props)}>${node.name === 'gcb/text' ? a.content || '' : children}</${tag}>`;
  }
  const name = node.name.replace(/^core\//, '');
  return `<!-- wp:${name}${Object.keys(stored).length ? ` ${serializeCommentAttributes(stored)}` : ''} -->${markup}<!-- /wp:${name} -->`;
}
function validateGutenbergMarkup(markup) {
  const stack = [], issues = [];
  const tokens = /<!--\s*(\/)?wp:([\w/-]+)(?:\s+(\{[\s\S]*?\}))?\s*(\/)?-->/g;
  for (const match of markup.matchAll(tokens)) {
    const [, closing, name, json, selfClosing] = match;
    if (json) { try { JSON.parse(json); } catch { issues.push(`Invalid JSON for ${name}.`); } }
    if (closing) { if (stack.pop() !== name) issues.push(`Mismatched closing block ${name}.`); }
    else if (!selfClosing) stack.push(name);
  }
  if (stack.length) issues.push(`Unclosed blocks: ${stack.join(', ')}.`);
  return { isValid: issues.length === 0, level: 'structure-only', wordpressValidation: 'The WordPress importer validates saved blocks before import.', issues };
}
async function convertHtmlToGutenbergJson({ html, css = '', js = '', title = 'Converted Page', mediaPrefix = '' }) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('HTML input is required.');
  if ([css, js, title, mediaPrefix].some(v => typeof v !== 'string')) throw new Error('CSS, JS, title and media prefix must be text.');
  const $ = cheerio.load(html, { scriptingEnabled: false });
  const embeddedCss = $('style').toArray().map(e => $(e).html() || '').join('\n');
  const sourceCss = [embeddedCss, css].filter(Boolean).join('\n');
  const embeddedJs = $('script:not([src])').toArray().map(e => $(e).html() || '').join('\n');
  const patternJs = [embeddedJs, js].filter(Boolean).join('\n');
  const unresolvedDependencies = [];
  $('link[rel="stylesheet"][href]').each((_, e) => {
    const url = $(e).attr('href');
    if (!css.trim() || /^(?:https?:)?\/\//i.test(url)) unresolvedDependencies.push({ type: 'stylesheet', url });
  });
  $('script[src]').each((_, e) => {
    if (!js.trim() || /^(?:https?:)?\/\//i.test($(e).attr('src'))) unresolvedDependencies.push({ type: 'script', url: $(e).attr('src') });
  });
  postcss.parse(sourceCss).walkAtRules('import', r => unresolvedDependencies.push({ type: 'css-import', url: r.params }));
  $('style,script,link,meta,title,base').remove();
  const cleanTitle = title.trim() || 'Converted Page';
  const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'converted-page';
  const hash = crypto.createHash('sha256').update(JSON.stringify([CONVERTER_REVISION, html, sourceCss, patternJs, mediaPrefix])).digest('hex').slice(0, 16);
  const scopeId = `gcb-${hash}`;
  const scopeSelector = `.gcb-scope.${scopeId}`;
  const inlineRules = [], warnings = [], imageInfo = [];
  let maxIds = 0;
  postcss.parse(sourceCss).walkRules(r => {
    selectorParser(selectors => selectors.each(s => { let ids = 0; s.walkIds(() => ids++); maxIds = Math.max(maxIds, ids); })).processSync(r.selector);
  });
  const inlineSpecificity = `:not(#gcb-reserved-${hash})`.repeat(maxIds + 1);
  let sourceInlineCount = 0;
  $('html,body,body *').each((_, el) => {
    const $el = $(el);
    for (const name of Object.keys(el.attribs || {})) {
      if (/^on/i.test(name)) { warnings.push(`Removed inline event ${name} on <${el.name}>; move its behavior into the JS input.`); $el.removeAttr(name); }
    }
    const inline = $el.attr('style');
    if (inline) {
      const inlineClass = `gcb-inline-${++sourceInlineCount}`;
      $el.addClass(inlineClass).removeAttr('style');
      const parsed = postcss.parse(`x{${rewriteCssUrls(inline, mediaPrefix)}}`);
      if (parsed.nodes.length !== 1 || parsed.first.nodes.some(n => n.type !== 'decl' && n.type !== 'comment')) throw new Error('An inline style contains invalid CSS.');
      parsed.first.selector = `${scopeSelector}.${inlineClass}${inlineSpecificity}, ${scopeSelector} .${inlineClass}${inlineSpecificity}`;
      inlineRules.push(parsed.toString());
    }
    if (el.name === 'img') {
      const originalSrc = $el.attr('src') || '';
      const resolvedSrc = resolveMediaUrl(originalSrc, mediaPrefix);
      $el.attr('src', resolvedSrc);
      if ($el.attr('srcset') && !/^data:/i.test($el.attr('srcset'))) {
        $el.attr('srcset', $el.attr('srcset').split(',').map(part => {
          const [url, ...descriptor] = part.trim().split(/\s+/);
          return [resolveMediaUrl(url, mediaPrefix), ...descriptor].join(' ');
        }).join(', '));
      }
      imageInfo.push({ originalSrc, resolvedSrc, filename: cleanFilename(originalSrc), alt: $el.attr('alt') || '', tag: 'img' });
    }
  });
  const nativeAttrs = el => {
    const attrs = {};
    if (el.attribs.class) attrs.className = el.attribs.class;
    if (el.attribs.id) attrs.anchor = el.attribs.id;
    return attrs;
  };
  const sourceAttrs = el => {
    const attrs = { tagName: el.name, htmlAttributes: { ...el.attribs } };
    if (attrs.htmlAttributes.class) attrs.className = attrs.htmlAttributes.class;
    delete attrs.htmlAttributes.class;
    return attrs;
  };
  const canUseCore = el => Object.keys(el.attribs).every(k => k === 'class' || k === 'id');
  const isRich = el => $(el).children().toArray().every(child => PHRASING.has(child.name) && $(child).find('*').toArray().every(n => PHRASING.has(n.name)))
    // Empty icon spans and font-icon <i> elements are not editable text.
    && !$(el).find('i,span').toArray().some(n => !$(n).text().trim() && ($(n).attr('class') || $(n).attr('aria-hidden')));
  function convert(el) {
    if (el.type === 'text') return el.data ? { name: 'gcb/markup', attributes: { content: esc(el.data) } } : null;
    if (el.type !== 'tag') return null;
    const content = $(el).html() || '';
    if (el.attribs['data-wcs-menu'] || MARKUP_TAGS.has(el.name) || (['i', 'span'].includes(el.name) && !$(el).text().trim() && (el.attribs.class || el.attribs['aria-hidden']))) return { name: 'gcb/markup', attributes: { content: $.html(el) } };
    if (/^h[1-6]$/.test(el.name) && canUseCore(el) && isRich(el)) return { name: 'core/heading', attributes: { level: Number(el.name[1]), ...nativeAttrs(el), content } };
    if (el.name === 'p' && canUseCore(el) && isRich(el)) return { name: 'core/paragraph', attributes: { ...nativeAttrs(el), content } };
    if (el.name === 'img') {
      const attrs = sourceAttrs(el); delete attrs.tagName;
      return { name: 'gcb/image', attributes: attrs };
    }
    if (RICH_TAGS.has(el.name) && isRich(el)) return { name: 'gcb/text', attributes: { ...sourceAttrs(el), content } };
    if (CONTAINERS.has(el.name)) return { name: 'gcb/element', attributes: sourceAttrs(el), innerBlocks: $(el).contents().toArray().filter(n => n.type !== 'text' || n.data.trim()).map(convert).filter(Boolean) };
    warnings.push(`<${el.name}> is preserved as a Source Markup block and needs code editing.`);
    return { name: 'gcb/markup', attributes: { content: $.html(el) } };
  }
  const documentClasses = [$('html').attr('class'), $('body').attr('class')].filter(Boolean).join(' ');
  const rootAttributes = { tagName: 'div', className: `gcb-scope ${scopeId}${documentClasses ? ` ${documentClasses}` : ''}`, htmlAttributes: {} };
  for (const key of ['id', 'lang', 'dir']) if ($('body').attr(key) || $('html').attr(key)) rootAttributes.htmlAttributes[key] = $('body').attr(key) || $('html').attr(key);
  const blockTree = [{ name: 'gcb/element', attributes: rootAttributes, innerBlocks: $('body').contents().toArray().filter(n => n.type !== 'text' || n.data.trim()).map(convert).filter(Boolean) }];
  // A full HTML document starts with the browser's 8px body margin unless its
  // stylesheet resets it. HTML fragments retain the previous edge-to-edge base.
  // Source body declarations below override this baseline, including padding.
  const documentMargin = '0';
  const patternCss = `${scopeSelector}{display:block;margin:${documentMargin};padding:0;max-width:none;}\n${scopeCss(rewriteCssUrls(sourceCss, mediaPrefix), scopeSelector)}\n${inlineRules.join('\n')}\n`;
  const content = blockTree.map(serializeNode).join('');
  const counts = {};
  const walk = list => list.forEach(n => { counts[n.name] = (counts[n.name] || 0) + 1; walk(n.innerBlocks || []); });
  walk(blockTree);
  if (imageInfo.some(x => x.resolvedSrc && !/^(?:[a-z][\w+.-]*:|\/|#)/i.test(x.resolvedSrc))) warnings.push('Some images still have relative URLs. Supply their real uploaded location or absolute URLs; this converter does not upload images.');
  if (patternJs.trim()) warnings.push('JavaScript is an external frontend asset. Review initialization before using multiple instances; it is not executed in the editor.');
  if (unresolvedDependencies.length) warnings.push('Linked dependencies were not supplied. Add their contents to the CSS/JS inputs and remove the resolved links/@imports before importing.');
  if (/\bid\s*=/i.test(html)) warnings.push('Source anchors are preserved. Give duplicate anchors unique IDs if inserting this pattern twice on one page.');
  return {
    __file: 'wp_block', title: cleanTitle, slug, content, syncStatus: 'unsynced',
    format: 'gcb-bundle', formatVersion: 1, blockTree, patternScopeId: scopeId,
    patternCss, patternJs,
    manifest: { format: 'gcb-bundle', version: 1, id: scopeId, cssFile: `${scopeId}.css`, jsFile: patternJs.trim() ? `${scopeId}.js` : null, unresolvedDependencies },
    installation: 'Install Gutenberg Converter Runtime, then use Tools > Gutenberg Converter Import. Standard pattern import does not install CSS/JS assets.',
    meta: { generatedBy: `Gutenberg Converter ${CONVERTER_REVISION}`, engineType: 'Deterministic DOM and CSS parser', sourceInlineCount, outputInlineCount: 0, structuralValidation: validateGutenbergMarkup(content), warnings: [...new Set(warnings)] },
    summary: { imageDetails: imageInfo, imagesPreserved: imageInfo.map(x => x.filename), blockStats: { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) } }
  };
}
module.exports = { convertHtmlToGutenbergJson, scopeCss, resolveMediaUrl, cleanMediaUrl, cleanFilename, validateGutenbergMarkup, serializeNode };
