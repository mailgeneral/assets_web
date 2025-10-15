/**
 * =================================================================================
 * WORKER DE CLOUDFLARE PAGES - PROXY DINÁMICO DE ACTIVOS
 * =================================================================================
 * Este worker intercepta las peticiones al dominio de activos (assets-web-27t.pages.dev),
 * el cual actúa como un repetidor del repositorio de activos en GitHub:
 * https://github.com/mailgeneral/assets_web
 *
 * Su propósito es servir activos desde URLs sin extensión, permitiendo activar
 * un "interruptor de degradación" de forma remota sin tocar el HTML del cliente.
 *
 * RESUMEN TÁCTICO:
 * 1.  Inspecciona la ruta de la URL de la petición entrante.
 * 2.  Si la ruta ya tiene una extensión de archivo (ej. /style.css, /index.js),
 *     permite que la petición proceda al archivo original como se espera.
 * 3.  Si la ruta es '/main-layout', la reescribe a '/main-layout.html' para servir
 *     el contenido principal del sitio.
 * 4.  Si la ruta NO tiene extensión y no es '/main-layout' (es decir, es una imagen),
 *     asume que es un alias y le añade la extensión '.webp'.
 * 5.  El navegador no es consciente de esta reescritura; recibe el activo
 *     correcto de forma transparente.
 *
 * Esto proporciona un mecanismo de control potente y centralizado sobre el rendimiento del sitio.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const hasKnownExtension = /\.(css|js|json|png|jpg|jpeg|webp|gif|svg|ico|txt|html|map)$/i.test(path);

    if (hasKnownExtension) {
      return env.ASSETS.fetch(request);
    }

    // LÓGICA VIP: Si la petición es para el layout principal, reescribimos a .html
    if (path === '/main-layout') {
        const newUrl = new URL(`${path}.html`, url.origin);
        return env.ASSETS.fetch(newUrl.toString());
    }

    // LÓGICA DE IMÁGENES (INTERRUPTOR DE DEGRADACIÓN)
    // Para activar el "Modo Degradado", cambia '.webp' a '.png'.
    const targetExtension = '.webp';
    const newUrl = new URL(`${path}${targetExtension}`, url.origin);

    return env.ASSETS.fetch(newUrl.toString());
  },
};
