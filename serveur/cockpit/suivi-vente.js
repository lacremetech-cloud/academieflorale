// @ts-check
/**
 * Ce qu'une vente enregistrée dans le cockpit déclenche, quand elle porte l'email de l'élève :
 * 1. ActiveCampaign : l'élève entre dans la liste « Client » et sort de la liste « Prospect » ;
 * 2. Meta : l'événement « Achat » (API de conversion), une seule fois par vente ;
 * 3. le cockpit retient la publicité qui l'avait fait s'inscrire.
 *
 * Règles :
 * - hors production, rien n'est écrit, sauf dans ActiveCampaign pour l'adresse de test ;
 * - un événement « Achat » déjà parti n'est jamais renvoyé, même si la vente change ;
 * - aucune donnée personnelle dans les journaux.
 */
import { joursEntre } from '../../partage/attribution.js';
import { jourParis } from '../../partage/cockpit.js';
import { FORMULES } from '../../partage/ventes.js';
import { nettoyerEmail } from '../../partage/validation.js';
import { changerListe, synchroniserContact } from '../activecampaign.js';
import { empreinteEmail } from '../empreinte.js';
import { accesConversions, construireEvenement, envoiPermis, envoyerEvenement, regleConsentement } from '../meta-conversions.js';
import { LISTES } from '../reglages.js';
import { lireInscriptions, noterEtat } from '../suivi.js';

/**
 * Fait passer un contact de « Prospect » à « Client ».
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.email
 * @param {typeof fetch} options.fetchImpl
 * @param {(ms: number) => Promise<void>} [options.attente]
 * @returns {Promise<boolean>}
 */
async function passerCliente({ env, email, fetchImpl, attente }) {
  const acces = { apiUrl: String(env.ACTIVECAMPAIGN_API_URL), apiKey: String(env.ACTIVECAMPAIGN_API_KEY), fetchImpl };
  const fiche = await synchroniserContact({ ...acces, contact: { email }, avecId: true, ...(attente ? { attente } : {}) });
  if (!fiche.ok || !fiche.id) return false;
  const entree = await changerListe({ ...acces, contact: fiche.id, liste: LISTES.client, action: 'inscrire' });
  if (!entree.ok) return false;
  const sortie = await changerListe({ ...acces, contact: fiche.id, liste: LISTES.prospect, action: 'desinscrire' });
  // 404 ou 422 : elle n'était pas (ou plus) dans « Prospect », il n'y a rien à retirer.
  return sortie.ok || sortie.statut === 404 || sortie.statut === 422;
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {import('../../partage/ventes.js').Vente} options.vente la vente à suivre (avec son identifiant)
 * @param {import('../../partage/ventes.js').Vente} [options.ancienne] la même vente avant sa modification
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 * @param {Pick<Console, 'warn' | 'error'>} [options.journal]
 * @param {(ms: number) => Promise<void>} [options.attente]
 * @returns {Promise<import('../../partage/ventes.js').SuiviVente | undefined>} undefined sans email
 */
export async function suivreVente({ env, vente, ancienne, fetchImpl = fetch, maintenant = new Date(), journal = console, attente }) {
  const email = nettoyerEmail(vente.email ?? '');
  if (!email) return undefined;
  const production = env.VERCEL_ENV === 'production';
  const adresseDeTest = nettoyerEmail(env.LEAD_TEST_EMAIL ?? '');
  const memeEleve = ancienne?.email === email;
  const avant = memeEleve ? (ancienne?.suivi ?? {}) : {};

  // La publicité qui l'avait fait s'inscrire, si le tunnel l'a vue passer.
  const inscription = (await lireInscriptions(env, [email], { fetchImpl })).get(empreinteEmail(email))?.inscription ?? null;
  const jourVente = Date.parse(`${vente.date}T12:00:00Z`);
  /** @type {import('../../partage/ventes.js').SuiviVente} */
  const suivi = {
    pub: inscription?.pub || avant.pub || '',
    delai: inscription ? joursEntre(inscription.jour, vente.date) : (avant.delai ?? null),
    le: maintenant.toISOString(),
  };

  // 1. ActiveCampaign : « Client », et plus « Prospect ».
  if (avant.ac === 'ok') suivi.ac = 'ok';
  else if (!env.ACTIVECAMPAIGN_API_URL || !env.ACTIVECAMPAIGN_API_KEY) suivi.ac = 'a-brancher';
  else if (!production && email !== adresseDeTest) suivi.ac = 'simulation';
  else {
    const fait = await passerCliente({ env, email, fetchImpl, attente });
    suivi.ac = fait ? 'ok' : 'erreur';
    if (!fait) journal.error('vente : échec ActiveCampaign');
    await noterEtat(env, 'client', { t: maintenant.toISOString(), ok: fait }, { fetchImpl });
  }

  // 2. Meta : l'événement « Achat », une seule fois.
  if (avant.meta === 'ok') suivi.meta = 'ok';
  else if (!accesConversions(env)) suivi.meta = 'a-brancher';
  else if (!production) suivi.meta = 'simulation';
  else if (!envoiPermis(inscription?.accord === 1, regleConsentement(env))) suivi.meta = 'sans-accord';
  else {
    // Une vente du jour part à l'instant ; une vente passée, à midi ce jour-là.
    const instant = vente.date === jourParis(maintenant) ? maintenant : new Date(jourVente);
    const resultat = await envoyerEvenement(
      env,
      construireEvenement({
        nom: 'Purchase',
        id: `vente-${vente.id}`,
        instant,
        // La vente se conclut pendant l'appel, pas sur le site.
        origine: 'phone_call',
        personne: { email, fbc: inscription?.fbc },
        donnees: {
          currency: 'EUR',
          value: vente.montant,
          content_name: /** @type {Record<string, string>} */ (FORMULES)[vente.formule] ?? vente.formule,
        },
      }),
      { fetchImpl, maintenant },
    );
    suivi.meta = resultat.etat === 'ok' ? 'ok' : resultat.etat === 'trop-ancien' ? 'trop-ancienne' : 'erreur';
    if (resultat.etat === 'erreur') journal.error('vente : échec de l’API de conversion', { statut: resultat.statut ?? 0 });
    await noterEtat(env, 'conversions', { t: maintenant.toISOString(), nom: 'Purchase', ok: resultat.etat === 'ok', detail: resultat.detail ?? '' }, { fetchImpl });
  }
  return suivi;
}
