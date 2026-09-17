# Converter Studio 11 — setup

1. Deactivate the older **WordPress Converter Bridge**, then install and activate **Converter Studio Bridge 1.6.0** from `public/downloads/wordpress-converter-bridge.zip`. The package now uses the `converter-studio-bridge` folder. Imported pages and media remain. Keep Elementor active for Elementor pages, and Pro for Pro widgets.
2. Run `npm ci`, then `npm run dev` using Node.js 22+. Production uses `npm run build` and `npm start`, behind HTTPS.
3. Enter **WordPress URL**, **WordPress username**, and **Application Password** in the UI. Create the password in WordPress → Users → Profile → Application Passwords. Use an account with `manage_options` and `unfiltered_html` permissions. No Studio/session token or environment WordPress credentials are used.
4. On Deploy choose your editor, upload the whole website folder, confirm titles and the detected homepage/favicon, and click **Deploy & publish**. Links appear after successful saves. Use **Deploy as drafts** when appropriate; draft pages cannot become the homepage.

## Choose how the header and footer work

The **Header and footer** selector appears in Gutenberg and Elementor single-page and multiple-page screens, and on Deploy.

- **Global — shared across pages:** extract and create/reuse shared templates. The page contains its main content. Pages with the same site key/editor share the templates. Choose Keep or Replace shared design as needed.
- **Inside content — separate for each page:** keep the supplied header, main content and footer together in that page's editable content. It does not use global templates. Updating this page's header/footer affects only this page; other pages' existing shared templates are retained.

Select the mode before conversion/deployment. Existing split converter JSON can be joined into one native page while retaining its scoped CSS/JS and blocks/widgets. JSON already containing one page cannot reliably be split back into global parts without its original HTML; re-upload that source to extract global templates. For an already deployed page, reload its source and set its existing page ID to update it in the other mode.

Inside-content mode includes only the header/footer actually supplied in that page or JSON; it does not copy another page's existing global template. The Images screen has no page-layout option because it only uploads media.

## Folder structure and links

Use Choose folder to preserve paths, for example:

```text
website/
  index.html
  pages/about.html
  assets/styles.css
  assets/app.js
  assets/logo.png
  favicon.ico
```

Reference assets relative to each HTML document. In `pages/about.html`, `../index.html` links to the source homepage. In `index.html`, `pages/about.html#team` links to the About page's anchor. Deploy all target pages using the same site key and editor. Ordinary footer and body links are resolved to current WordPress permalinks after target pages exist; query strings and fragments are preserved. External domains, missing target pages and download links stay unchanged. Links created by arbitrary JavaScript may require adapting the source script.

After upgrading, re-deploy original source pages and Replace shared parts once to save complete source-path metadata. Clear WordPress/hosting/CDN caches after deploying the complete site.

## Automatic settings and retries

Deploy detects a unique shallowest `index.html`/`index.htm`, or the only uploaded page, as the homepage. Confirm or override it in Publishing Options. Keep current homepage leaves WordPress's setting unchanged. Icons are detected from local HTML icon links, then common filenames. A chosen icon is prepared as a square 512-pixel PNG, preserving aspect ratio. Small source icons may appear soft when enlarged.

Images are uploaded through resumable small requests and content deduplication, retaining filename aliases. A later failure does not undo earlier saves. Retry in the same tab to reuse completed pages/uploads. Retry site settings handles homepage/favicon failures without recreating saved pages.

## Connections

All workspaces share the active UI connection. Save site to list is optional and persists URL/username only. Application Passwords remain in tab memory and must be re-entered after a reload. Changing destination clears old WordPress page IDs and receipts while keeping source files. Connections are locked during operations.

Public HTTPS WordPress sites on port 443 are supported. The destination must allow Application Passwords and REST requests. Private/local destinations and restricted WordPress roles are rejected. Studio itself can run locally; production Studio must use HTTPS. Do not log authorization headers or put credentials in public environment variables.

The bridge still needs one-time installation on each destination. It is not published on WordPress.org yet. WordPress's core REST API cannot upload this private ZIP using only an Application Password. See WORDPRESS-ORG-AUDIT.md for release status. Elementor Pro, live host behavior and external form integrations require destination-site verification.
