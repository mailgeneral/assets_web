export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    
    const hasKnownExtension = /\.(css|js|json|png|jpg|jpeg|webp|gif|svg|ico|txt|html|map)$/i.test(path);

    if (hasKnownExtension) {
      
      return env.ASSETS.fetch(request);
    }

   
    const targetExtension = '.png';
    const newUrl = new URL(`${path}${targetExtension}`, url.origin);

   
    return env.ASSETS.fetch(newUrl.toString());
  },
};
