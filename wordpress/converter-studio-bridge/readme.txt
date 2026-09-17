=== Converter Studio Bridge ===
Tags: import, migration, block editor, page builder
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.6.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Import converted pages, media and shared site parts through an authenticated REST API.

== Description ==

Accepts converter-generated Gutenberg and Elementor JSON, creates or updates pages and imports media with resumable requests. Studio can deploy global header/footer templates or retain the header and footer in each page's native editable content. Source-file links resolve to WordPress page permalinks.

The included Tools import screens accept JSON directly. HTML conversion requires the separate Studio application. Elementor is optional; Elementor pages require Elementor, and Pro widgets require Elementor Pro. Neither Elementor edition is bundled.

= Permissions =
API operations require manage_options and unfiltered_html. Use an Application Password over HTTPS. Local Tools screens use logged-in WordPress authentication with REST nonces. Subscribers and anonymous users cannot import. Multisite users without unfiltered_html cannot import executable source content.

= Source scripts and privacy =
Admin-supplied HTML, CSS and JavaScript are intentionally retained. Only import trusted source code. Source files may reference third-party fonts, images, scripts and services that visitors' browsers contact. Review those references before publishing. The bundled Lucide script is served locally.

The bridge does not phone home, collect telemetry, store Application Passwords or require registration with an external provider. A user chooses the external Studio client; that client's hosting and privacy policy are separate. No external hosted Studio service is bundled. Form delivery and third-party integrations require separate configuration.

= Storage and removal =
WordPress uploads hold media and design assets. Options and post metadata hold source mappings, retry receipts and shared-part associations. Temporary uploads expire after a day via WP-Cron, which must run for cleanup. Uninstall removes scheduled temporary jobs and staging files but retains imported pages, media, design assets, menus and persistent metadata to avoid data loss. This rendering runtime remains necessary for converter-specific blocks and shared layouts.

== Installation ==

1. Deactivate the older WordPress Converter Bridge if installed; do not activate both bridge folders.
2. Upload this ZIP under Plugins > Add New > Upload Plugin and activate Converter Studio Bridge.
3. Create an Application Password for an administrator with unfiltered_html permission.
4. Enter URL, username and Application Password in Studio, or use the local JSON import tools.

== Frequently Asked Questions ==

= Can headers and footers remain inside page content? =
Yes. In Studio choose Header and footer > Inside content. Other pages' shared templates remain intact.

= Does the bridge convert any website by itself? =
No. It receives converter JSON from the separate Studio application. Arbitrary third-party scripts and integrations may need adaptation.

= Why do identical images share a media item? =
Content is deduplicated, while each source filename retains a URL mapping.

= What about internal footer links? =
Matching source paths are resolved when managed pages render. Missing pages, other domains, downloads and fragment-only links are left unchanged. Clear hosting page caches after deploying a complete batch.

== Changelog ==

= 1.6.0 =
* Resolve ordinary footer/body links and nested page paths.
* Preserve source mappings without global templates.
* Add user ownership to media jobs.
* Improve distribution, privacy and removal documentation.
* Include readable Lucide source.

== Upgrade Notice ==

= 1.6.0 =
Deactivate the old bridge before activating this renamed package. Re-deploy source pages and replace shared parts once to save path metadata, then clear page caches.
