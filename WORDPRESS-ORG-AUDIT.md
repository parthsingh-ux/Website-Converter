# Converter Studio Bridge — public release audit

Audit date: 15 September 2026. Package: Converter Studio Bridge 1.6.0.

**Status: a working private distribution, not a WordPress.org-approved release.** The functional changes are implemented. Publication still needs owner-supplied information and completion of the review items below. No submission was made.

## Changes made for distribution

- Consistent `converter-studio-bridge` folder, main filename, display name and text domain. The name does not begin with the WordPress trademark.
- Plugin headers and readme declare the version, minimum WordPress/PHP versions and GPL license. The full GPLv2 license is included; the original author's right to license all supplied code still requires confirmation.
- Human-readable Lucide JavaScript is shipped locally with its ISC/Feather notices. There is no bundled Elementor or Elementor Pro distribution.
- Removed nested runtime plugin headers, documented optional dependencies and the standalone manual JSON import tools.
- Documented the separate Studio client, imported source scripts, external references, data storage and removal behavior. No bridge telemetry, forced frontend credits or remote updater was found in the inspected code.
- New media jobs are owned by the WordPress user who created them. REST imports require `manage_options` and `unfiltered_html`; local import screens use WordPress REST nonces.
- Added uninstall cleanup of scheduled temporary upload jobs and staging files while preserving users' published content and its metadata.

## Review against the directory guidelines

The [WordPress.org detailed guidelines](https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/) cover licensing, ownership, source readability, stable distribution, service disclosures, consent, executable code, conduct, credits, admin behavior, marketing, core libraries, release practices, completeness and trademarks. The review mapped these to this package:

| Area | Finding / remaining action |
| --- | --- |
| Rights and GPL compatibility | License and third-party notices included. Owner must confirm rights to every supplied runtime and asset. |
| Readable source | Plugin PHP/JS sources included; readable Lucide replaces the minified-only distribution. |
| Complete functionality | Bridge supports local JSON import and authenticated remote deployment. The separate HTML converter is not bundled in the plugin. |
| Service and privacy disclosures | Readme explains imported scripts, external source references, credential handling and storage. Add the real public Studio URL, privacy policy, terms and data-retention policy if distributing a hosted service. |
| External executable code | No remote self-updater added. The importer intentionally accepts administrator-supplied frontend JS; disclose this management workflow explicitly to reviewers. Do not claim automatic approval for it. |
| Consent and branding | No bridge telemetry or forced frontend credits found. Imported source content remains the administrator's responsibility. |
| Admin interface | Import screens are under Tools. Review translated strings, keyboard/screen-reader behavior and errors before public release. |
| Compatibility | Functional testing is recorded in VERIFICATION.md. Do not infer compatibility with every theme, PHP version, multisite setup or Elementor Pro release. |
| Release metadata | Supply real Author/Contributor identity and support/source URLs. Confirm an available directory slug. Tested up to is set to the tested WordPress 7.1 version; verify the intended public release matrix before submission. |
| Distribution and maintenance | Private ZIP supplied. After approval, maintain matching versions in directory tags/trunk, respond to security reports and provide support. |

## Security and automated review limits

Application Passwords grant the selected user's authority; they do not make subscriber accounts administrators. The Studio proxy rejects private destinations and redirects and keeps credentials out of browser persistent storage. Host Studio over HTTPS and avoid logging authorization headers. Rate limiting and abuse controls for a publicly hosted conversion service remain deployment responsibilities.

The bridge intentionally renders trusted administrator-supplied HTML and JS. Those rendering outputs need contextual review; blindly escaping the whole document would destroy the imported site. Review all other dynamic outputs, translations, request validation and file writes with Plugin Check and WordPress coding standards before submission. Existing compact runtime code is not claimed to have a clean standards/security audit.

Plugin Check was attempted in WordPress Playground. Its PHP_CodeSniffer stdin handling initially crashed in this environment. The test harness was adjusted only to skip unavailable stdin and capture output; shipped plugin code does not contain that workaround. The captured initial run returned **25 errors and 4 warnings**, preserved in `review/plugin-check-initial.txt`. This update replaces direct deletion with `wp_delete_file()`, escapes dynamic exception messages and supplies the tested-version readme header. The remaining categories concern direct stream operations needed for resumable byte offsets/locking, atomic rename in asset writes, and intentional rendering of administrator-supplied HTML. They have not been suppressed or claimed resolved. The four database warnings concern media hash queries and alias lookup costs. A successful functional test is not a clean Plugin Check pass or security certification. Run the final package through Plugin Check on normal staging and review each remaining finding before submission.

## Installation automation boundary

The [core Plugins REST API](https://developer.wordpress.org/rest-api/reference/plugins/) supports installing a WordPress.org plugin by slug and activating installed plugins with sufficient capabilities. It does not upload arbitrary private ZIPs using an Application Password. Therefore this package requires one-time manual installation until an approved directory release or an explicitly authorized hosting-management API exists. No bypass of host or WordPress permissions is included.

## Before public submission

1. Complete the owner identity, service documentation and licensing confirmations above.
2. Run Plugin Check on a normal staging WordPress installation, resolve reported errors, and review intentional raw-import findings individually. Test supported minimum versions, multisite constraints, uninstall, and Elementor Pro with a valid installation.
3. Validate the readme and submit through the [WordPress.org plugin submission page](https://wordpress.org/plugins/developers/add/). Only the directory review team can approve publication.
