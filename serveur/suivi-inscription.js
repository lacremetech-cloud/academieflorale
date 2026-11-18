// @ts-check
/**
 * Après une inscription réussie, en production :
 * 1. retenir la publicité d'arrivée de l'inscrite (pour le rapport du cockpit) ;
 * 2. envoyer à Meta l'événement « Prospect » (API de conversion), si elle y a consenti.
 * Ne lève jamais d'erreur, et ne journalise aucune donnée personnelle.
 */
import { fbcDepuis } from '../partage/attribution.js';
import { accesConversions, construireEvenement, envoiPermis, envoyerEvenement } from './meta-conversions.js';
import { enregistrerInscription, noterEtat } from './suivi.js';

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {import('./lead.js').InscriptionSuivie} options.inscription
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 * @param {Pick<Console, 'warn' | 'error'>} [options.journal]
 * @returns {Promise<{ retenue: boolean, nouvelle: boolean, meta: 'ok' | 'a-brancher' | 'sans-accord' | 'deja' | 'erreur' | 'trop-ancien' }>}
 */
export async function suivreInscription({ env, inscription, fetchImpl = fetch, maintenant = new Date(), journal = console }) {
  const { email, prenom, telephone, variante, utm, accord, ip, ua, fbp, adresse, idEvenement } = inscription;
  let retenue = { ok: false, nouvelle: false };
  try {
    retenue = await enregistrerInscription(env, { email, variante, utm, accord, contexte: { ip, ua, fbp } }, { fetchImpl, maintenant });
  } catch {
    /* la base ne répond pas : l'inscription reste valable */
  }

  if (!accesConversions(env)) return { retenue: retenue.ok, nouvelle: retenue.nouvelle, meta: 'a-brancher' };
  if (!envoiPermis(accord)) return { retenue: retenue.ok, nouvelle: retenue.nouvelle, meta: 'sans-accord' };
  // Une adresse déjà inscrite ne fait pas un second prospect. (Si la base n'a pas répondu, on envoie.)
  if (retenue.ok && !retenue.nouvelle) return { retenue: true, nouvelle: false, meta: 'deja' };

  const resultat = await envoyerEvenement(
    env,
    construireEvenement({
      nom: 'Lead',
      id: idEvenement,
      instant: maintenant,
      origine: 'website',
      adresse,
      personne: { email, telephone, prenom, ip, ua, fbp, fbc: fbcDepuis(utm.fbclid, maintenant.getTime()) },
      donnees: variante ? { content_name: variante } : undefined,
    }),
    { fetchImpl, maintenant },
  );
  if (resultat.etat === 'erreur') journal.error('lead : échec de l’API de conversion', { statut: resultat.statut ?? 0 });
  if (resultat.etat !== 'a-brancher') {
    await noterEtat(env, 'conversions', { t: maintenant.toISOString(), nom: 'Lead', ok: resultat.etat === 'ok', detail: resultat.detail ?? '' }, { fetchImpl });
  }
  return { retenue: retenue.ok, nouvelle: retenue.nouvelle, meta: resultat.etat };
}
