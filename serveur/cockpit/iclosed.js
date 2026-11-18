// @ts-check
/**
 * Cockpit, source « iClosed » : les appels d'un tunnel et leurs suites.
 * - appels : appels réservés ce jour-là (date de réservation) ;
 * - annules, absentes : parmi les appels prévus ce jour-là.
 * Sans précision, ce sont ceux de l'event du tunnel VSL ; les onglets Webinaire et
 * Organique donnent leurs propres events (partage/tunnels.js).
 * Les ventes ne sont pas lues ici : elles se saisissent à la main dans le cockpit.
 * (Le client de l'API et la variable ICLOSED_API_KEY : serveur/iclosed.js.)
 */
import { joursEcoules } from '../../partage/cockpit.js';
import { ErreurIclosed, estAbsente, estAnnule, jourDe, LIEN_EVENT, lireAppels, lister, trouverEvent, trouverEvents } from '../iclosed.js';

/**
 * Ce qu'il faut dire quand iClosed ne répond pas comme prévu.
 * @param {unknown} erreur
 */
export function detailErreurIclosed(erreur) {
  if (erreur instanceof ErreurIclosed) return erreur.message;
  const nom = erreur instanceof Error ? erreur.name : '';
  return nom === 'TimeoutError' ? 'iClosed ne répond pas (délai dépassé)' : 'iClosed est injoignable';
}

/**
 * Les appels de l'event du tunnel réservés entre deux jours (date de réservation),
 * tels qu'iClosed les rend : pour le rapport des publicités.
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string[]} options.jours jours de la période, dans l'ordre
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, appels: any[] }>}
 */
export async function lireAppelsReserves({ env, jours, fetchImpl = fetch }) {
  const cle = (env.ICLOSED_API_KEY ?? '').trim();
  if (!cle) return { etat: 'a-brancher', appels: [] };
  if (jours.length === 0) return { etat: 'ok', appels: [] };
  const dansLaPeriode = new Set(jours);
  // Fenêtre élargie d'un jour de chaque côté : le tri par jour se fait ensuite à l'heure de Paris.
  const debut = new Date(Date.parse(`${jours[0]}T00:00:00Z`) - 86400000).toISOString();
  const fin = new Date(Date.parse(`${jours[jours.length - 1]}T23:59:59.999Z`) + 86400000).toISOString();
  try {
    const event = await trouverEvent(cle, fetchImpl);
    if (!event) return { etat: 'erreur', detail: `event « ${LIEN_EVENT} » introuvable dans iClosed`, appels: [] };
    const reserves = await lister('/v1/eventCalls', { eventIds: event, eventType: 'ALL', createdAtStart: debut, createdAtEnd: fin }, 100, lireAppels, cle, fetchImpl);
    return { etat: 'ok', appels: reserves.filter((appel) => dansLaPeriode.has(jourDe(appel?.createdAt))) };
  } catch (erreur) {
    return { etat: 'erreur', detail: detailErreurIclosed(erreur), appels: [] };
  }
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.mois
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 * @param {readonly { event: string, nom: string }[]} [options.events] les events d'un autre tunnel que le VSL
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, jours: Record<string, Record<string, number>>,
 *   parEvent?: { event: string, nom: string, appels: number, annules: number, absentes: number }[] }>}
 */
export async function lireIclosed({ env, mois, fetchImpl = fetch, maintenant = new Date(), events }) {
  const cle = (env.ICLOSED_API_KEY ?? '').trim();
  if (!cle) return { etat: 'a-brancher', jours: {} };
  if (events) return lireEvents({ cle, mois, fetchImpl, maintenant, events });

  // Jusqu'à aujourd'hui seulement : les jours à venir ne s'affichent pas.
  const jours = joursEcoules(mois, maintenant);
  if (jours.length === 0) return { etat: 'ok', jours: {} };
  const dansLeMois = new Set(jours);
  // Fenêtre élargie d'un jour de chaque côté : le tri par jour se fait ensuite à l'heure de Paris.
  const debut = new Date(Date.parse(`${jours[0]}T00:00:00Z`) - 86400000).toISOString();
  const fin = new Date(Date.parse(`${jours[jours.length - 1]}T23:59:59.999Z`) + 86400000).toISOString();

  /** @type {Record<string, Record<string, number>>} */
  const resultat = {};
  /** @param {string} jour @param {string} chiffre */
  const ajouter = (jour, chiffre) => {
    if (!dansLeMois.has(jour)) return;
    const ligne = (resultat[jour] ??= { appels: 0, annules: 0, absentes: 0 });
    ligne[chiffre] = (ligne[chiffre] ?? 0) + 1;
  };

  try {
    // 1. L'event du tunnel, retrouvé par son adresse.
    const event = await trouverEvent(cle, fetchImpl);
    if (!event) return { etat: 'erreur', detail: `event « ${LIEN_EVENT} » introuvable dans iClosed`, jours: {} };
    const commun = { eventIds: event, eventType: 'ALL' };

    // 2. Les appels réservés dans le mois (date de réservation).
    const reserves = await lister('/v1/eventCalls', { ...commun, createdAtStart: debut, createdAtEnd: fin }, 100, lireAppels, cle, fetchImpl);
    for (const appel of reserves) ajouter(jourDe(appel?.createdAt), 'appels');

    // 3. Les appels prévus dans le mois : annulations et absences.
    const prevus = await lister('/v1/eventCalls', { ...commun, dateFrom: debut, dateTo: fin }, 100, lireAppels, cle, fetchImpl);
    for (const appel of prevus) {
      const jour = jourDe(appel?.dateTimeUTC ?? appel?.dateTime);
      if (estAnnule(appel)) ajouter(jour, 'annules');
      else if (estAbsente(appel)) ajouter(jour, 'absentes');
    }
  } catch (erreur) {
    return { etat: 'erreur', detail: detailErreurIclosed(erreur), jours: {} };
  }
  return { etat: 'ok', jours: resultat };
}

/**
 * Les appels de plusieurs events, jour par jour (tous events confondus), et le
 * total de chaque event sur le mois. Une demande par event : on sait ainsi d'où
 * vient chaque appel, sans dépendre de ce qu'iClosed écrit dans l'appel.
 * @param {object} options
 * @param {string} options.cle
 * @param {string} options.mois
 * @param {typeof fetch} options.fetchImpl
 * @param {Date} options.maintenant
 * @param {readonly { event: string, nom: string }[]} options.events
 */
async function lireEvents({ cle, mois, fetchImpl, maintenant, events }) {
  const jours = joursEcoules(mois, maintenant);
  const parEvent = events.map(({ event, nom }) => ({ event, nom, appels: 0, annules: 0, absentes: 0 }));
  if (jours.length === 0) return { etat: /** @type {const} */ ('ok'), jours: {}, parEvent };
  const dansLeMois = new Set(jours);
  // Fenêtre élargie d'un jour de chaque côté : le tri par jour se fait ensuite à l'heure de Paris.
  const debut = new Date(Date.parse(`${jours[0]}T00:00:00Z`) - 86400000).toISOString();
  const fin = new Date(Date.parse(`${jours[jours.length - 1]}T23:59:59.999Z`) + 86400000).toISOString();

  /** @type {Record<string, Record<string, number>>} */
  const resultat = {};
  /** @param {number} rang @param {string} jour @param {'appels' | 'annules' | 'absentes'} chiffre */
  const ajouter = (rang, jour, chiffre) => {
    if (!dansLeMois.has(jour)) return;
    const ligne = (resultat[jour] ??= { appels: 0, annules: 0, absentes: 0 });
    ligne[chiffre] = (ligne[chiffre] ?? 0) + 1;
    const source = parEvent[rang];
    if (source) source[chiffre] += 1;
  };

  try {
    const ids = await trouverEvents(cle, fetchImpl, events.map(({ event }) => event));
    const manquant = events.find(({ event }) => !ids.has(event));
    if (manquant) return { etat: /** @type {const} */ ('erreur'), detail: `event « ${manquant.event} » introuvable dans iClosed`, jours: {} };
    await Promise.all(
      events.map(async ({ event }, rang) => {
        const commun = { eventIds: String(ids.get(event)), eventType: 'ALL' };
        const [reserves, prevus] = await Promise.all([
          lister('/v1/eventCalls', { ...commun, createdAtStart: debut, createdAtEnd: fin }, 100, lireAppels, cle, fetchImpl),
          lister('/v1/eventCalls', { ...commun, dateFrom: debut, dateTo: fin }, 100, lireAppels, cle, fetchImpl),
        ]);
        for (const appel of reserves) ajouter(rang, jourDe(appel?.createdAt), 'appels');
        for (const appel of prevus) {
          const jour = jourDe(appel?.dateTimeUTC ?? appel?.dateTime);
          if (estAnnule(appel)) ajouter(rang, jour, 'annules');
          else if (estAbsente(appel)) ajouter(rang, jour, 'absentes');
        }
      }),
    );
  } catch (erreur) {
    return { etat: /** @type {const} */ ('erreur'), detail: detailErreurIclosed(erreur), jours: {} };
  }
  return { etat: /** @type {const} */ ('ok'), jours: resultat, parEvent };
}
