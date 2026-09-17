# Gutenberg Converter Runtime 2.1

Install this folder as a WordPress plugin and activate it. Requires WordPress 6.6+ and PHP 7.4+.

Use **Tools > Gutenberg Converter Import** to import the JSON from the corrected converter. This route requires an administrator with `unfiltered_html` capability because source HTML and JavaScript are being installed. The importer validates blocks with the installed WordPress JavaScript APIs, then saves a pattern and external assets.

The plugin registers four source-preserving Gutenberg blocks. It must remain active for block editing and asset loading. Existing unsynced page copies are not automatically migrated or overwritten. Referenced media must already exist at the URLs in the export.

Frontend asset loading follows conversion IDs in the actual content rather than page titles or slugs, including synced pattern references. The editor loads all registered scoped CSS so newly inserted patterns have styles. JavaScript loads on the frontend only. Late-rendered content gets a stylesheet link once if its CSS was not discovered before the head.

Imported revisions retain their files. Deactivation and uninstall do not delete patterns or assets. To change an imported design, regenerate it with the source converter, import the new revision and replace the page's old unsynced copy.

## Version 2.1 update

Fixes missing form controls, table-cell text, SVG icons and embeds during import. A new Source Markup block stores compound HTML explicitly; the importer also upgrades core/html leaves in version 2.0 bundle trees. Empty font-icon elements stay outside RichText editing. Required icon stylesheets, fonts and image files must still be supplied.

Full HTML documents preserve the browser's default 8px body margin; authored body margin/padding rules override it. HTML fragments keep a zero-margin base. Update the converter and regenerate to apply spacing corrections. Update the Full Width theme to 2.1 so its editor stylesheet does not override the root spacing.

Existing unsynced page copies require replacing the affected blocks/pattern after reimport. Reimporting repairs the pattern, not already inserted copies. If an old bundle tree still contains an element, reimport can recover it even when its content field is missing that element. Assets or markup absent from the source cannot be recreated by import.
