# Elementor Converter Runtime 1.1

Install this ZIP under WordPress > Plugins > Add New > Upload Plugin. Activate Elementor, and keep this runtime active for asset loading. Elementor Pro is an add-on to the free Elementor plugin; both are active when using Pro exports.

Use **Tools > Elementor Converter Import** to upload JSON generated in Elementor Free or Elementor Pro mode. The importer checks the actual registered widgets, controls, repeater fields and relevant breakpoints on your site. It saves a new draft Elementor page template through Elementor's document API, then checks retained elements and content. It does not overwrite existing pages, change your active theme, or configure form delivery.

Open the draft template using the returned Elementor link. To use it on a page, create a page, choose the Elementor Canvas layout, open Elementor and insert the template from My Templates (save/publish the template first if your library view filters out drafts). The draft can also be found under Templates > Saved Templates. Import the bundle through the Tools screen first: standard Elementor JSON import does not install the additional CSS/JS asset fields.

CSS/JS files are written to wp-content/uploads/elementor-converter/. Styles follow the conversion class, so they also work after Elementor replaces element IDs when inserting a template. Frontend scripts load once; source JS is not run in the editor. The preview editor loads registered scoped styles. Asset discovery covers the main page and late-rendered templates. Deactivation/uninstall does not delete user templates or assets.

Free mode uses native containers, headings, text, buttons, images and suitable standalone Font Awesome icons. Pro mode additionally maps simple forms with text/email/tel/url/number/hidden/textarea fields to the native Form widget. Form submission actions are intentionally empty: configure Actions After Submit in Elementor. Forms with existing action URLs or unsupported field structures stay in HTML widgets so their original markup is retained.

This release preserves tables, inline SVGs, native details/summary FAQs, embeds, compound icons, responsive picture/srcset markup and unsupported structures in HTML widgets. These are reported fallbacks, not native table/accordion/form widgets. They are editable as HTML. No Pro code or license is bundled.

Compatibility targets Elementor's established container/widget JSON model, not the newer Atomic Elements format. Validation uses your installed control definitions; unsupported controls produce an error before template creation. Standard media mappings use mobile 767px and tablet 1024px. Other media queries stay external. If your site customizes those standard breakpoints and the export actually uses mapped responsive controls, import stops rather than modifying site-wide settings.

This plugin has passed PHP syntax parsing and static source review. It has not been activated on a live WordPress/Elementor installation in this workspace; PHP execution, Pro rendering and full visual parity remain to be checked on a draft/staging page.

Version 1.1 retains safe root data/ARIA attributes and loads the bundled ISC-licensed Lucide 1.43.0 dependency before source scripts when required by the export. Regenerate and reimport after updating; old saved templates are not rewritten automatically.
