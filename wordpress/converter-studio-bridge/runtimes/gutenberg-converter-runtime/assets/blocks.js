/* Source-preserving Gutenberg blocks. No frontend JavaScript dependency. */
(function (wp) {
  'use strict';
  const el = wp.element.createElement;
  const { registerBlockType, getBlockType } = wp.blocks;
  const { useBlockProps, useInnerBlocksProps, RichText, InspectorControls, MediaUpload, MediaUploadCheck, BlockControls } = wp.blockEditor;
  const { PanelBody, TextControl, TextareaControl, Button, ToolbarGroup, ToolbarButton } = wp.components;
  const attributes = {
    tagName: { type: 'string', default: 'div' },
    htmlAttributes: { type: 'object', default: {} },
    className: { type: 'string' }
  };
  const supports = { html: false, customClassName: true, anchor: false, color: false, typography: false, spacing: false, layout: false };
  const aliases = { for: 'htmlFor', tabindex: 'tabIndex', srcset: 'srcSet', crossorigin: 'crossOrigin', readonly: 'readOnly', maxlength: 'maxLength', cellpadding: 'cellPadding', cellspacing: 'cellSpacing', colspan: 'colSpan', rowspan: 'rowSpan' };
  const booleans = new Set(['hidden', 'open', 'disabled', 'required', 'multiple', 'readonly', 'autofocus', 'checked', 'selected']);
  function props(a) {
    const p = {};
    Object.entries(a.htmlAttributes || {}).forEach(([key, value]) => {
      if (/^on/i.test(key) || key === 'style' || key === 'class' || key === 'className') return;
      p[aliases[key] || key] = booleans.has(key) ? value !== false : value;
    });
    return p;
  }
  function preventNavigation(event) {
    if (event.target.closest('a,button')) event.preventDefault();
  }
  function updateAttribute(a, setAttributes, key, value) {
    setAttributes({ htmlAttributes: { ...a.htmlAttributes, [key]: value } });
  }
  function identityControls(a, setAttributes) {
    return el(InspectorControls, {}, el(PanelBody, { title: 'Source element' },
      el('p', {}, 'Layout and responsive styles come from the imported stylesheet.'),
      el(TextControl, { label: 'HTML anchor', value: (a.htmlAttributes || {}).id || '', onChange: value => updateAttribute(a, setAttributes, 'id', value) }),
      a.tagName === 'a' ? el(TextControl, { label: 'Link URL', value: (a.htmlAttributes || {}).href || '', onChange: value => updateAttribute(a, setAttributes, 'href', value) }) : null
    ));
  }
  // Unlike core/html's evolving innerContent API, this block has an explicit
  // persistent attribute and save function. RawHTML adds no frontend wrapper.
  if (!getBlockType('gcb/markup')) registerBlockType('gcb/markup', {
    apiVersion: 3, title: 'Source Markup (Form, Table or Icon)', category: 'widgets', icon: 'html',
    attributes: { content: { type: 'string', default: '' } },
    supports: { html: false, customClassName: false, className: false, reusable: true },
    edit: function ({ attributes: a, setAttributes }) {
      return el(wp.element.Fragment, {},
        el(InspectorControls, {}, el(PanelBody, { title: 'Source markup' },
          el('p', {}, 'Preserves forms, tables, icons and embeds. Edit their HTML here. Form delivery requires the original submission handler.'),
          el(TextareaControl, { label: 'HTML', value: a.content || '', rows: 16, onChange: content => setAttributes({ content }) })
        )),
        el('div', useBlockProps({ style: { display: 'contents' }, onClickCapture: preventNavigation, onSubmit: event => event.preventDefault() }),
          el('div', { style: { display: 'contents' }, inert: '', dangerouslySetInnerHTML: { __html: a.content || '' } }))
      );
    },
    save: function ({ attributes: a }) { return el(wp.element.RawHTML, {}, a.content || ''); }
  });
  if (!getBlockType('gcb/element')) registerBlockType('gcb/element', {
    apiVersion: 3, title: 'Source Container', category: 'design', icon: 'layout', attributes, supports,
    edit: function ({ attributes: a, setAttributes }) {
      const p = useBlockProps({ ...props(a), onClick: preventNavigation });
      if (a.tagName === 'details') p.open = true;
      const inner = useInnerBlocksProps(p);
      return el(wp.element.Fragment, {}, identityControls(a, setAttributes), el(a.tagName || 'div', inner));
    },
    save: function ({ attributes: a }) {
      return el(a.tagName || 'div', useInnerBlocksProps.save(useBlockProps.save(props(a))));
    }
  });
  if (!getBlockType('gcb/text')) registerBlockType('gcb/text', {
    apiVersion: 3, title: 'Source Text or Link', category: 'text', icon: 'editor-textcolor',
    attributes: { ...attributes, content: { type: 'string', default: '' } }, supports,
    edit: function ({ attributes: a, setAttributes }) {
      const p = useBlockProps({ ...props(a), onClick: preventNavigation });
      return el(wp.element.Fragment, {}, identityControls(a, setAttributes),
        el(RichText, { ...p, tagName: a.tagName || 'div', value: a.content || '', onChange: content => setAttributes({ content }), placeholder: 'Text…' }));
    },
    save: function ({ attributes: a }) {
      return el(RichText.Content, { ...useBlockProps.save(props(a)), tagName: a.tagName || 'div', value: a.content || '' });
    }
  });
  if (!getBlockType('gcb/image')) registerBlockType('gcb/image', {
    apiVersion: 3, title: 'Source Image', category: 'media', icon: 'format-image',
    attributes: { htmlAttributes: attributes.htmlAttributes, className: attributes.className }, supports,
    edit: function ({ attributes: a, setAttributes }) {
      const p = useBlockProps(props(a));
      const choose = media => setAttributes({ htmlAttributes: { ...a.htmlAttributes, src: media.url, alt: media.alt || '' } });
      return el(wp.element.Fragment, {},
        el(BlockControls, {}, el(ToolbarGroup, {}, el(MediaUploadCheck, {}, el(MediaUpload, {
          allowedTypes: ['image'], onSelect: choose,
          render: ({ open }) => el(ToolbarButton, { onClick: open }, 'Replace image')
        })))),
        el(InspectorControls, {}, el(PanelBody, { title: 'Image' },
          el(TextControl, { label: 'Image URL', value: p.src || '', onChange: value => updateAttribute(a, setAttributes, 'src', value) }),
          el(TextControl, { label: 'Alternative text', value: p.alt || '', onChange: value => updateAttribute(a, setAttributes, 'alt', value) })
        )),
        p.src ? el('img', p) : el('div', p, el(MediaUploadCheck, {}, el(MediaUpload, { allowedTypes: ['image'], onSelect: choose, render: ({ open }) => el(Button, { onClick: open, variant: 'secondary' }, 'Choose image') })))
      );
    },
    save: function ({ attributes: a }) { return el('img', useBlockProps.save(props(a))); }
  });
})(window.wp);
