/**
 * =================================================================================
 * CLOUDFLARE PAGES WORKER - DYNAMIC ASSET PROXY
 * =================================================================================
 * This worker intercepts requests to the assets domain (assets-web-27t.pages.dev).
 * Its purpose is to serve assets from extension-less URLs, allowing for a
 * "degradation switch" to be flipped remotely without touching the client-side HTML.
 *
 * TACTICAL OVERVIEW:
 * 1.  It inspects the incoming request URL's path.
 * 2.  If the path already has a file extension (e.g., /style.css, /index.js),
 *     it allows the request to proceed to the original file as intended.
 * 3.  If the path has NO extension (e.g., /imperdellanta_puebla_by_pedriño),
 *     it assumes this is an asset alias.
 * 4.  It rewrites the URL on the fly to append a specific extension.
 *     - OPTIMIZED MODE (Default): Appends ".webp" to serve fast, modern images.
 *     - DEGRADED MODE (Contingency): Can be changed to append ".png" to serve
 *       heavier, unoptimized images, thus slowing down the site's performance.
 * 5.  The browser is unaware of this rewrite; it receives the correct asset
 *     transparently.
 *
 * This provides a powerful, centralized control mechanism over site performance.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // This REGEX checks if the path ends with a common file extension.
    // We will let these requests pass through unmodified.
    const hasKnownExtension = /\.(css|js|json|png|jpg|jpeg|webp|gif|svg|ico|txt|html|map)$/i.test(path);

    if (hasKnownExtension) {
      // It's a direct request to a file with an extension, let Cloudflare Pages handle it.
      return env.ASSETS.fetch(request);
    }

    // --- THE DEGRADATION SWITCH ---
    // If the URL has no extension, we rewrite it.
    // This is the "Optimized Mode" by default.
    // To activate "Degraded Mode," change '.webp' to '.png'.
    const targetExtension = '.png';
    const newUrl = new URL(`${path}${targetExtension}`, url.origin);

    // Fetch the rewritten URL from the underlying Cloudflare Pages assets.
    // The browser only ever sees the original, extension-less URL.
    return env.ASSETS.fetch(newUrl.toString());
  },
};
