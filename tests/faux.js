// Faux services pour les tests : une base (comme Upstash), iClosed, ActiveCampaign et Meta,
// servis par un seul faux « fetch » qui garde la trace de chaque demande.
// Aucune demande ne sort réellement de la machine.
import { creerBaseLocale } from '../outils/base-locale.js';

export const BASE = 'https://base.test';
export const AC = 'https://compte.api-us1.com';

/** Variables d'une production entièrement branchée. */
export const PROD = Object.freeze({
  VERCEL_ENV: 'production',
  KV_REST_API_URL: BASE,
  KV_REST_API_TOKEN: 'jeton-de-la-base-de-test',
  ACTIVECAMPAIGN_API_URL: `${AC}/`,
  ACTIVECAMPAIGN_API_KEY: 'cle-activecampaign-de-test',
  ICLOSED_API_KEY: 'cle-iclosed-de-test',
  META_ACCESS_TOKEN: 'jeton-meta-de-test',
  META_AD_ACCOUNT_ID: 'act_123456789',
  META_PIXEL_ID: '1234567890123456',
  META_CAPI_TOKEN: 'jeton-conversions-de-test',
});

const json = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json' } });

/**
 * @param {object} [services]
 * @param {(url: URL, options: any) => unknown} [services.iclosed] réponse d'iClosed
 * @param {(url: URL, options: any, corps: any) => unknown} [services.activecampaign] réponse d'ActiveCampaign (objet, ou Response)
 * @param {(url: URL, options: any, corps: any) => unknown} [services.meta] réponse de l'API Graph de Meta
 */
export function fauxMonde(services = {}) {
  const base = creerBaseLocale();
  /** @type {{ url: URL, options: any, corps: any }[]} */
  const demandes = [];
  const fetchImpl = async (adresse, options = {}) => {
    const url = new URL(adresse);
    let corps = null;
    try {
      corps = options.body ? JSON.parse(options.body) : null;
    } catch {
      corps = options.body;
    }
    if (url.origin === BASE) return base(corps);
    demandes.push({ url, options, corps });
    const service =
      url.hostname === 'public.api.iclosed.io' ? services.iclosed : url.origin === AC ? services.activecampaign : url.hostname === 'graph.facebook.com' ? services.meta : null;
    if (!service) return json({ erreur: 'service inattendu' }, 500);
    const reponse = await service(url, options, corps);
    return reponse instanceof Response ? reponse : json(reponse);
  };
  /** Exécute des commandes dans la base, pour préparer ou vérifier un test. */
  const commandes = async (...liste) => (await base(liste).json()).map((ligne) => ligne.result);
  return {
    fetchImpl,
    demandes,
    commandes,
    /** Les demandes parties vers un service. @param {'iclosed' | 'activecampaign' | 'meta'} nom */
    vers(nom) {
      return demandes.filter(({ url }) =>
        nom === 'iclosed' ? url.hostname === 'public.api.iclosed.io' : nom === 'activecampaign' ? url.origin === AC : url.hostname === 'graph.facebook.com',
      );
    },
  };
}

/** Journal capturé : rien ne s'affiche, tout se relit. */
export function fauxJournal() {
  const lignes = [];
  return { lignes, journal: { warn: (...a) => lignes.push(a), error: (...a) => lignes.push(a) } };
}

/**
 * iClosed de test : l'event du tunnel (n° 77), d'autres events si on les donne, et les appels donnés.
 * Comme le vrai, il ne rend que les appels des events demandés (un appel sans « eventId » est toujours rendu).
 */
export function fauxIclosed(appels, autresEvents = []) {
  return (url) => {
    if (url.pathname === '/v1/events') return { data: [{ id: 77, linkPrefix: 'academie-florale/candidature-vsl' }, ...autresEvents] };
    if (url.pathname === '/v1/eventCalls') {
      const tous = typeof appels === 'function' ? appels(url) : appels;
      const voulus = (url.searchParams.get('eventIds') ?? '').split(',').filter(Boolean);
      const liste = voulus.length > 0 ? tous.filter((a) => a.eventId === undefined || voulus.includes(String(a.eventId))) : tous;
      return { data: { eventCalls: liste, count: liste.length } };
    }
    return new Response('{}', { status: 404 });
  };
}
