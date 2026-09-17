# WordPress Converter Studio 11

Next.js application for Gutenberg and Elementor conversion, page creation/update, folder deployment, media imports and shared site parts.

See [SETUP.md](SETUP.md) for installation and usage, [VERIFICATION.md](VERIFICATION.md) for testing, and [WORDPRESS-ORG-AUDIT.md](WORDPRESS-ORG-AUDIT.md) for plugin release findings.

This update replaces Studio tokens and environment WordPress destinations with URL/username/Application Password fields in the UI. It fixes source-file links in ordinary footers/body content, adds explicit global-versus-inside-content header/footer choices, and improves automatic favicon/homepage handling in Deploy. Existing converter engines and the application header/sidebar are retained.

## Structure

```text
src/app/                    Next.js pages and API routes
src/features/converter/     Connections, workspaces, queues, layout choice
src/features/deploy/        Folder deployment and favicon preparation
src/lib/conversion/         Source bundling and native editor conversion
src/lib/wordpress/          Per-request authenticated WordPress transport
src/components/             Existing design-system components
wordpress/converter-studio-bridge/  Plugin and bundled rendering runtimes
public/downloads/           Installable bridge ZIP
scripts/package-plugin.py   Plugin packaging
tests/                      Regression tests
```

Run `npm test` and `npm run build`. Rebuild plugin downloads with `python3 scripts/package-plugin.py` after changing PHP/runtime files.

Studio requests carry `Authorization: Basic <base64(username:application-password)>` and `X-WordPress-URL`. The server validates and pins public DNS targets, rejects redirects/private addresses and forwards credentials to the selected site over HTTPS. WordPress independently enforces account capabilities. No shared Studio bearer token is used. A public hosted Studio still needs hosting-level abuse protection; this change does not add SaaS account management or billing.

The bridge's endpoints are under `/wp-json/wcs/v1/`. A bridge installation is required per destination while privately distributed. No live WordPress site was changed and no plugin was publicly submitted during this task.

# Website-Converter
