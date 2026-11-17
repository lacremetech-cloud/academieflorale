import { defineConfig } from 'astro/config';

// Adresse publique du site, utile aux balises de partage (Open Graph).
// Sur Vercel : le domaine de production en production, l'adresse de la preview sinon.
const adresse =
  process.env.SITE_URL ??
  (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:4321');

export default defineConfig({
  site: adresse,
  // Adresses sans barre finale ni « .html » : /video, /call…
  // (Vercel retire l'extension grâce à « cleanUrls » dans vercel.json.)
  trailingSlash: 'never',
  build: { format: 'file' },
  // Compression sans perte : les espaces entre les mots ne sont jamais supprimés.
  compressHTML: true,
  devToolbar: { enabled: false },
});
