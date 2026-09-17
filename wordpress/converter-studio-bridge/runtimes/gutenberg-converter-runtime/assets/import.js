(function (wp) {
  'use strict';
  const status = document.getElementById('gcb-status');
  const button = document.getElementById('gcb-import-button');
  if (!wp.blocks.getBlockType('core/paragraph')) wp.blockLibrary.registerCoreBlocks();
  const allowed = new Set(['core/heading', 'core/paragraph', 'core/html', 'gcb/element', 'gcb/text', 'gcb/image', 'gcb/markup']);
  function create(tree, depth) {
    if (depth > 64 || !Array.isArray(tree)) throw new Error('Invalid block tree.');
    return tree.map(node => {
      if (!allowed.has(node.name)) throw new Error('Unsupported block: ' + node.name);
      // Repair version 2.0 bundles from their intact blockTree, even if their
      // preview content has already lost the core/html leaf markup.
      const name = node.name === 'core/html' ? 'gcb/markup' : node.name;
      if (!wp.blocks.getBlockType(name)) throw new Error('Update Gutenberg Converter Runtime before importing: missing ' + name);
      return wp.blocks.createBlock(name, node.attributes || {}, create(node.innerBlocks || [], depth + 1));
    });
  }
  function invalid(blocks) {
    return blocks.some(block => block.isValid === false || invalid(block.innerBlocks || []));
  }
  function escape(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function sourceMarkup(tree) {
    return tree.map(node => {
      const a = node.attributes || {};
      if (node.name === 'core/html' || node.name === 'gcb/markup') return a.content || '';
      const tag = node.name === 'core/heading' ? 'h' + (a.level || 2) : node.name === 'core/paragraph' ? 'p' : node.name === 'gcb/image' ? 'img' : a.tagName || 'div';
      const attrs = { ...(a.htmlAttributes || {}) };
      if (a.className) attrs.class = a.className;
      if (a.anchor) attrs.id = a.anchor;
      const attrText = Object.entries(attrs).filter(([,v]) => v !== false && v != null).map(([k,v]) => ' ' + k + '="' + escape(v === true ? '' : v) + '"').join('');
      return '<' + tag + attrText + '>' + (tag === 'img' ? '' : (node.name === 'gcb/element' ? sourceMarkup(node.innerBlocks || []) : a.content || '') + '</' + tag + '>');
    }).join('');
  }
  function fingerprint(markup) {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    function visit(node) {
      if (node.nodeType === 3) return node.textContent.replace(/\s+/g, ' ').trim() || null;
      if (node.nodeType !== 1) return null;
      const attrs = Array.from(node.attributes).map(attr => [attr.name, attr.name === 'class' ? attr.value.split(/\s+/).filter(c => c && !c.startsWith('wp-block-')).sort().join(' ') : attr.value])
        .filter(([k,v]) => k !== 'class' || v).sort(([a],[b]) => a.localeCompare(b));
      return [node.tagName, attrs, Array.from(node.childNodes).map(visit).filter(n => n !== null)];
    }
    return JSON.stringify(visit(doc.body));
  }
  button.addEventListener('click', async function () {
    const file = document.getElementById('gcb-file').files[0];
    if (!file) { status.textContent = 'Choose a converter JSON file first.'; return; }
    button.disabled = true;
    status.textContent = 'Validating blocks and importing assets…';
    try {
      const bundle = JSON.parse(await file.text());
      if (bundle.format !== 'gcb-bundle' || bundle.formatVersion !== 1) throw new Error('Use a JSON export from the corrected converter (version 2). Legacy JSON must be regenerated from the source HTML/CSS.');
      if (bundle.manifest?.unresolvedDependencies?.length) throw new Error('Supply the missing CSS/JS dependencies in the converter before importing.');
      const blocks = create(bundle.blockTree, 0);
      const content = wp.blocks.serialize(blocks);
      if (invalid(wp.blocks.parse(content))) throw new Error('WordPress could not validate the generated blocks. Nothing was imported.');
      if (fingerprint(sourceMarkup(bundle.blockTree)) !== fingerprint(content)) throw new Error('WordPress serialization changed source content or attributes. Nothing was imported. Update the runtime and regenerate the conversion.');
      const response = await fetch(window.gcbImport.restUrl, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': window.gcbImport.nonce },
        body: JSON.stringify({ ...bundle, content })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Import failed.');
      status.textContent = 'Imported “' + result.title + '”. Insert it from Patterns > My patterns. ';
      const link = document.createElement('a'); link.href = result.editUrl; link.textContent = 'Edit imported pattern'; status.appendChild(link);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
})(window.wp);
