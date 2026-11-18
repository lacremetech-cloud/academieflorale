import { defineConfig } from 'astro/config';

// Adresse publique du tunnel : c'est elle que portent les liens envoyés aux prospectes,
// donc celle des balises de partage (Open Graph) des pages ressources.
// À changer ici le jour où le tunnel change de domaine (ou par la variable SITE_URL).
const DOMAINE_PUBLIC = 'https://decouvrir.academie-florale.fr';
const adresse = process.env.SITE_URL ?? (process.env.VERCEL ? DOMAINE_PUBLIC : 'http://localhost:4321');

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
