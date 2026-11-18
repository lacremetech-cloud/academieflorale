// Middleware de routage Vercel : il s'exécute avant de servir /inscription.
// Il choisit une des promesses en test (parts égales) et sert sa page sans changer
// l'adresse : la visiteuse reste sur /inscription, avec tous ses paramètres.
// Le même clic (même fbclid) revoit toujours la même promesse, sans cookie.
// En production, il compte aussi l'affichage pour le cockpit (test des promesses).
import { rewrite, waitUntil } from '@vercel/functions';
import { compter } from './partage/compteurs.js';
import { choisirVariante } from './partage/repartition.js';
import { visiteACompter } from './partage/visites.js';

export const config = { matcher: '/inscription' };

/** @param {Request} request */
export default function middleware(request) {
  const url = new URL(request.url);
  const variante = choisirVariante(url.searchParams.get('fbclid'));
  try {
    const env = typeof process !== 'undefined' ? process.env : {};
    // Après la réponse : compter ne retarde jamais l'affichage de la landing.
    if (env.VERCEL_ENV === 'production' && visiteACompter(request)) waitUntil(compter(env, 'vues', variante));
  } catch {
    /* le compteur ne doit jamais gêner l'affichage de la landing */
  }
  url.pathname = `/inscription/${variante}`;
  return rewrite(url);
}
