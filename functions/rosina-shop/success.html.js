import { serveAssetWithHeaders } from "../_lib/html-security.js";

const SUCCESS_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

export async function onRequestGet(context) {
  return serveAssetWithHeaders(context, "/rosina-shop/success.html", {
    "Content-Security-Policy": SUCCESS_CSP,
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    Expires: "0",
  });
}
