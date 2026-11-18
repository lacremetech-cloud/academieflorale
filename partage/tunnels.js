// @ts-check
/**
 * Les tunnels que le cockpit suit, un par onglet :
 * - VSL : le tunnel de ce site (landing, vidéo, appel) ;
 * - Webinaire : « La Nuit des Fleuristes Indépendantes » (publicités Meta, puis appel) ;
 * - Organique : les appels pris sans publicité (setting, messages privés, YouTube, site).
 *
 * Un seul endroit pour dire quelles campagnes Meta et quels events iClosed comptent
 * pour chacun. Un event iClosed se désigne par la fin de son adresse
 * (app.iclosed.io/e/<compte>/<event>).
 * Fonctions pures, communes au serveur et à la page : aucune dépendance, aucun secret.
 */
import { ICLOSED_VSL } from './iclosed.js';

/** L'onglet ouvert par défaut, et le tunnel d'une vente enregistrée avant les onglets. */
export const TUNNEL_PAR_DEFAUT = 'vsl';

export const TUNNELS = Object.freeze({
  vsl: Object.freeze({
    nom: 'VSL',
    events: Object.freeze([Object.freeze({ event: ICLOSED_VSL.event, nom: 'VSL' })]),
  }),
  webinaire: Object.freeze({
    nom: 'Webinaire',
    /** Les campagnes Meta du webinaire portent toutes son nom (relevé dans le compte le 18/11/2026). */
    campagnes: 'nuit des fleuristes',
    /** Le résultat que ces campagnes visent : une conversion personnalisée du compte. */
    resultat: 'Lead_NuitFleuristes',
    events: Object.freeze([Object.freeze({ event: 'candidature', nom: 'Webinaire' })]),
  }),
  organique: Object.freeze({
    nom: 'Organique',
    events: Object.freeze([
      Object.freeze({ event: 'candidature-dm', nom: 'Setting DM' }),
      Object.freeze({ event: 'candidature-yt', nom: 'YouTube' }),
      Object.freeze({ event: 'setting', nom: 'Setting call' }),
      Object.freeze({ event: 'candidature-site', nom: 'Site internet' }),
    ]),
  }),
});

/** @typedef {keyof typeof TUNNELS} Tunnel */

/**
 * @param {unknown} texte
 * @returns {texte is Tunnel}
 */
export function estTunnel(texte) {
  return typeof texte === 'string' && Object.hasOwn(TUNNELS, texte);
}

/**
 * Le tunnel demandé, ou celui par défaut si la demande ne dit rien de valable.
 * @param {unknown} texte
 * @returns {Tunnel}
 */
export function tunnelValide(texte) {
  return estTunnel(texte) ? texte : TUNNEL_PAR_DEFAUT;
}
