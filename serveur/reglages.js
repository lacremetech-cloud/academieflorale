// @ts-check
/**
 * Réglages du serveur : noms des tags et numéros des champs ActiveCampaign.
 * Un seul endroit, pour qu'un nom ne s'écrive jamais de deux façons.
 * (ActiveCampaign crée tout seul un tag inconnu : une faute de frappe ici
 * créerait un tag en double dans le compte.)
 */
import { ICLOSED_VSL } from '../partage/iclosed.js';

/** Tags d'étape du tunnel VSL, validés le 17/11/2026. */
export const TAGS = Object.freeze({
  inscrite: 'vsl-inscrite',
  rdv: 'vsl-rdv',
  rdvAnnule: 'vsl-rdv-annule',
});

/**
 * Tag de source, selon la source que déclare la landing.
 * Une landing destinée à un autre trafic que Meta ne déclare pas « meta » :
 * elle ne pose alors aucun tag de source.
 */
export const TAGS_SOURCE = Object.freeze({
  meta: 'VSL Meta Ads',
});

/**
 * Champs personnalisés ActiveCampaign, par numéro.
 * Numéros relevés dans le brief du 17/11/2026, à vérifier à la recette.
 */
export const CHAMPS = Object.freeze({
  /** « Source » : reste à « VSL », il sert peut-être de déclencheur à « VSL Séquence Mail ». */
  source: Object.freeze({ numero: '2', valeur: 'VSL' }),
  /** « Prise de RDV », rempli à la réservation. */
  priseDeRdv: Object.freeze({ numero: '3', valeur: 'VSL' }),
  /** « Nom de l'event », rempli à la réservation. */
  nomEvent: Object.freeze({ numero: '10' }),
  /**
   * UTM et page d'origine : champs à créer dans ActiveCampaign (décision ouverte).
   * Une fois créés, écris leur numéro ici. Tant qu'un numéro est vide, rien n'est envoyé.
   */
  utm: Object.freeze({
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    fbclid: '',
  }),
  pageOrigine: '',
});

/** Anti-spam : en dessous de ce délai entre l'affichage et l'envoi, c'est un robot. */
export const DELAI_MINIMAL_MS = 800;

/** Limitation : nombre d'envois acceptés par adresse IP sur la période. */
export const LIMITE_ENVOIS = 6;
export const LIMITE_PERIODE_MS = 10 * 60 * 1000;

/** Taille maximale du corps d'une demande, en caractères. */
export const TAILLE_MAX_DEMANDE = 4096;

/**
 * Webhook iClosed (/api/booking).
 * Seules les réservations de ces events sont traitées : les autres events du compte
 * iClosed (webinaire, autres tunnels) passent par le même webhook et sont ignorés.
 */
export const EVENTS_ICLOSED = Object.freeze([ICLOSED_VSL.event]);

/** Déclencheurs iClosed traités, tels qu'iClosed les nomme (comparés sans tenir compte de la casse). */
export const DECLENCHEURS = Object.freeze({
  reserve: Object.freeze(['call booked']),
  annule: Object.freeze(['call cancelled', 'call canceled']),
});

/** En dessous de cette longueur, le secret du webhook est refusé : la fonction reste fermée. */
export const SECRET_MIN = 16;

/** Taille maximale d'un webhook, en caractères (réponses au formulaire comprises). */
export const TAILLE_MAX_WEBHOOK = 65536;
