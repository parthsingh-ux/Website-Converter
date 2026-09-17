'use strict';
const cheerio = require('cheerio');
const crypto = require('node:crypto');
const path = require('node:path').posix;
const { convertHtmlToGutenbergJson } = require('./engines/converter.cjs');
const { convertHtmlToElementorJson } = require('./engines/elementor-converter.cjs');
const { assembleSourceBundle } = require('./engines/source-bundle.cjs');

function selectPart($, selector, fallback, label) {
  let candidates;
  try { candidates = $(selector || fallback); } catch { throw Error(`Invalid ${label} selector.`); }
  if (!selector) candidates = candidates.filter((_, n) => !$(n).parents('article,section,main,aside').length);
  if (candidates.length > 1) throw Error(`Several ${label} elements found. Set an explicit ${label} CSS selector or turn off shared parts.`);
  if (selector && !candidates.length) throw Error(`The ${label} selector did not match an element.`);
  return candidates[0] || null;
}
function menuItems($, nav, sourcePath = '') {
  const links = $(nav).find('a[href]').toArray();
  if (links.length > 200) throw Error('A navigation menu exceeds 200 items. Select a smaller navigation element.');
  return links.map((a, i) => {
    const li = $(a).closest('li');
    const parentLi = li.parent().closest('li');
    const parentAnchor = parentLi.children('a[href]')[0];
    let href = $(a).attr('href');
    if (sourcePath && href && !/^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(href)) {
      const [, pathname, suffix] = href.match(/^([^?#]*)(.*)$/);
      href = path.normalize(path.join(path.dirname(sourcePath), pathname)) + suffix;
    }
    $(a).attr('data-wcs-item',String(i+1));
    if (/^(?:javascript|data|vbscript):/i.test(href.trim())) throw Error('Navigation contains an unsafe URL.');
    return { key: String(i + 1), parent: parentAnchor ? String(links.indexOf(parentAnchor) + 1) : '0',
      label: $(a).text().trim() || $(a).attr('aria-label') || $(a).find('img').attr('alt') || `Link ${i + 1}`,
      url: href, target: $(a).attr('target') === '_blank' ? '_blank' : '' };
  });
}
// Clone the document and prune branches, retaining ancestor wrappers and their CSS hooks.
function sourceFor($, target, excluded, only) {
  const copy = cheerio.load($.html(), { scriptingEnabled: false });
  if (only) {
    const chosen = copy(`[data-wcs-part="${target}"]`)[0];
    const keep = new Set([chosen, ...copy(chosen).parents().toArray(), ...copy(chosen).find('*').toArray()]);
    copy('body *').toArray().reverse().forEach(n => { if (!keep.has(n)) copy(n).remove(); });
    copy('body').find('*').addBack().contents().filter((_,n) => n.type === 'text' && !copy(n).parents(`[data-wcs-part="${target}"]`).length).remove();
  } else excluded.forEach(name => copy(`[data-wcs-part="${name}"]`).remove());
  copy('[data-wcs-part]').removeAttr('data-wcs-part');
  if (only) copy('script').remove();
  return copy.html();
}
async function convertSite(input) {
  const editor = input.editor || 'gutenberg';
  if (!['gutenberg','elementor'].includes(editor)) throw Error('Choose Gutenberg or Elementor.');
  let { html, css = '', js = '' } = input;
  const sourceManifest = input.files ? assembleSourceBundle(input) : null;
  if (sourceManifest) ({ html, css, js } = sourceManifest);
  if (typeof html !== 'string' || !html.trim()) throw Error('Add an HTML document.');
  if ([html, css, js].some(x => typeof x !== 'string' || Buffer.byteLength(x) > 4 * 1024 * 1024)) throw Error('Each source field must be text smaller than 4 MB.');
  const siteKey = input.siteKey || 'default';
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(siteKey)) throw Error('Site key must use lowercase letters, numbers and hyphens (48 characters maximum).');
  const $ = cheerio.load(html, { scriptingEnabled:false });
  const preview = cheerio.load(html, { scriptingEnabled:false });
  preview('script,base,meta[http-equiv],iframe,object,embed').remove();
  preview('head').prepend('<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; style-src &apos;unsafe-inline&apos; https:; img-src data: https:; font-src data: https:; form-action &apos;none&apos;">');
  preview('head').append('<style>'+css.replace(/<\/style/gi,'<\\/style')+'</style>');
  for (const asset of input.imageAssets || []) preview('img').each((_,n) => { if ([asset.filename,'./'+asset.filename].includes(preview(n).attr('src'))) preview(n).attr('src',asset.data); });
  const title = String(input.title || 'Converted page').slice(0,200);
  const warnings = [...(sourceManifest?.manifest.warnings || [])];
  const shared = input.sharedParts !== false;
  const header = shared ? selectPart($, input.headerSelector, 'header,[role="banner"]', 'header') : null;
  const footer = shared ? selectPart($, input.footerSelector, 'footer,[role="contentinfo"]', 'footer') : null;
  if (header && footer && (header === footer || $(header).find(footer).length || $(footer).find(header).length)) throw Error('Header and footer must be separate, non-nested elements.');
  if (shared && !header) warnings.push('No global header detected; the existing shared header will be kept.');
  if (shared && !footer) warnings.push('No global footer detected; the existing shared footer will be kept.');
  if (header) $(header).attr('data-wcs-part','header').addClass('wcs-header-source');
  if (footer) $(footer).attr('data-wcs-part','footer');
  // Hoist all design assets before pruning so nested header/footer assets are not lost.
  const styles = $('style').toArray().map(n => $.html(n)).join('');
  const scripts = $('script').toArray().map(n => $.html(n)).join('');
  $('style,script').remove();
  $('head').append(styles + scripts);
  const menus = [];
  if (shared) for (const [kind, part] of [['header', header], ['footer', footer]]) {
    if (!part) continue;
    $(part).find('nav,[role="navigation"]').addBack('nav,[role="navigation"]').each((i, nav) => {
      if ($(nav).parents('nav,[role="navigation"]').length) return;
      const items = menuItems($, nav, input.sourcePath || sourceManifest?.manifest.entry || '');
      if (!items.length) return;
      const key = `${kind}-${i + 1}`;
      $(nav).attr('data-wcs-menu', key);
      menus.push({ key, label: `${siteKey} ${kind} ${i + 1}`, items });
    });
  }
  const parts = {};
  const converter = editor === 'elementor' ? convertHtmlToElementorJson : convertHtmlToGutenbergJson;
  for (const [name, node] of [['header', header], ['footer', footer], ['page', true]]) {
    if (!node) { parts[name] = null; continue; }
    parts[name] = await converter({ html: sourceFor($, name, shared ? ['header','footer'] : [], name !== 'page'), css,
      js: name === 'page' ? js : '', title: name === 'page' ? title : `${siteKey} ${name}`,
      mediaPrefix: input.mediaPrefix || '', edition: input.edition || 'free' });
    warnings.push(...(parts[name].ecb?.warnings || parts[name].manifest?.warnings || []).map(w => `${name}: ${w}`));
  }
  if (shared && (header || footer)) warnings.push('Shared parts retain ancestor wrappers. Review layouts relying on body-level grid, sibling selectors or JavaScript that moves nodes across parts.');
  return { format: 'wcs-site-bundle', version: 1, editor, edition: editor === 'elementor' ? input.edition || 'free' : undefined,
    title, siteKey, sourcePath: input.sourcePath || sourceManifest?.manifest.entry || '', sharedParts: shared, parts, menus, warnings: [...new Set(warnings)],
    imagesArray: input.imageAssets || [], previewHtml: preview.html(), sourceManifest: sourceManifest?.manifest,
    fingerprint: crypto.createHash('sha256').update(JSON.stringify({parts,menus,siteKey,shared})).digest('hex') };
}
function normalizeBundle(bundle, editor, siteKey = 'default') {
  if (bundle?.format === 'wcs-site-bundle') {
    if (bundle.version !== 1 || bundle.editor !== editor || !bundle.parts?.page) throw Error('This JSON uses a different editor or unsupported bundle version.');
    return bundle;
  }
  const isGutenberg = bundle?.format === 'gcb-bundle';
  const isElementor = bundle?.ecb?.format === 'elementor-converter-bundle';
  if (!(editor === 'gutenberg' ? isGutenberg : isElementor)) throw Error('Choose a converter JSON for this editor. Plain Elementor JSON without converter assets is not supported.');
  return { format:'wcs-site-bundle',version:1,editor,edition:bundle.ecb?.edition,title:bundle.title,siteKey,sharedParts:false,
    parts:{page:bundle,header:null,footer:null},menus:[],imagesArray:bundle.imagesArray||[],warnings:['Legacy JSON contains a single page. Reconvert the source to extract shared parts.'] };
}
module.exports = { convertSite, normalizeBundle, menuItems };
