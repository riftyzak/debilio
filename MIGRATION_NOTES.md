# Migration Notes

## Route mapping

| Legacy URL | React route |
| --- | --- |
| `/` | `/` (Home) |
| `/rajnoha` | `/rajnoha` |
| `/rosina-shop/` | `/rosina-shop` |
| `/rosina-shop/product/:slug` | `/rosina-shop/product/:slug` |
| `/rosina-shop/checkout.html` | `/rosina-shop/checkout` (alias route keeps `.html` working) |
| `/rosina-shop/admin.html` | `/rosina-shop/admin` (alias route keeps `.html` working) |
| `/rosina-shop/success.html` | `/rosina-shop/success` (alias route keeps `.html` working) |

`public/_redirects` includes Cloudflare Pages rewrites for the `.html` aliases and SPA fallback.

## Legacy code location

The original static HTML/JS content has been moved to `legacy/` for reference. Asset files remain at the repo root
(`/assets` and the favicon/manifest files) so the existing public paths keep working.

## Cloudflare Pages deployment

- **Build command:** `npm run build`
- **Output directory:** `dist`

This uses the default Vite static build output and relies on the `_redirects` file in `public/` for SPA routing.
A small Vite plugin copies the root-level assets/favicons into `dist/` during build so URLs like `/assets/*.webp`
remain valid.
