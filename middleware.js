// Middleware de routage Vercel : il ne s'exécute que pour /inscription.
// Il sert l'une des promesses en test sans changer l'adresse affichée : les UTM
// et le fbclid restent dans la barre d'adresse, comme si de rien n'était.
// Sans lui (aperçu local, panne), /inscription sert la promesse de repli.
import { rewrite } from '@vercel/functions';
import { choisirVariante } from './partage/repartition.js';

export const config = { matcher: '/inscription' };

/** @param {Request} request */
export default function middleware(request) {
  const url = new URL(request.url);
  url.pathname = `/inscription/${choisirVariante(url.searchParams.get('fbclid'))}`;
  return rewrite(url);
}
