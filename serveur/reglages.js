// @ts-check
/**
 * Réglages du serveur : noms des tags et numéros des champs ActiveCampaign.
 * Un seul endroit, pour qu'un nom ne s'écrive jamais de deux façons.
 * (ActiveCampaign crée tout seul un tag inconnu : une faute de frappe ici
 * créerait un tag en double dans le compte.)
 */

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
  /**
   * « Source » = « VSL » : c'est le déclencheur de l'automatisation « VSL Séquence Mail »
   * (vérifié dans le compte le 18/11/2026). Elle inscrit elle-même le contact à la liste
   * « Prospect » et lui pose le tag « VSL Meta Ads ».
   */
  source: Object.freeze({ numero: '2', valeur: 'VSL' }),
  /**
   * « Prise de RDV » = « VSL », rempli à la réservation : c'est le déclencheur de
   * l'automatisation « Onboarding Call » (liste « Prise de call », sortie de « Prospect »).
   */
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

/**
 * Listes ActiveCampaign, par numéro (relevées dans le compte le 18/11/2026).
 * À l'enregistrement d'une vente, l'élève entre dans « Client » et sort de « Prospect ».
 */
export const LISTES = Object.freeze({
  prospect: '3',
  client: '4',
});

/** Automatisations ActiveCampaign du tunnel, par numéro : le cockpit vérifie leur déclencheur. */
export const AUTOMATISATIONS = Object.freeze({
  sequence: Object.freeze({ numero: '1', nom: 'VSL Séquence Mail' }),
  appel: Object.freeze({ numero: '3', nom: 'Onboarding Call' }),
});

/**
 * API de conversion Meta : faut-il l'accord de la visiteuse avant d'envoyer ses
 * événements à Meta ?
 * - 'requis' : rien ne part sans un accord explicite (bandeau de consentement) ;
 * - 'non-requis' : les événements partent pour toutes les inscrites.
 * Décision qui revient à l'Académie (brief : « ne charger le pixel qu'après
 * consentement »). Tant qu'aucun bandeau ne recueille l'accord, 'requis' veut
 * dire qu'aucun événement n'est envoyé.
 */
export const CONSENTEMENT_META = /** @type {'requis' | 'non-requis'} */ ('requis');

/** Durée de garde de l'attribution d'une inscrite (sa publicité d'arrivée), en secondes : 400 jours. */
export const GARDE_INSCRIPTION_S = 400 * 86400;
/** Durée de garde du contexte technique d'une inscription (adresse IP, navigateur), en secondes : 14 jours. */
export const GARDE_CONTEXTE_S = 14 * 86400;

/**
 * Suivi des rendez-vous : à chaque passage, les appels créés ou modifiés depuis
 * moins de trois jours sont relus. Aucun appel réservé avant le début du suivi
 * n'est repris (pas d'écriture rétroactive dans ActiveCampaign ni chez Meta).
 */
export const RDV_RECUL_MS = 3 * 86400000;
export const SUIVI_DEPUIS = '2026-11-18T00:00:00Z';

/** Anti-spam : en dessous de ce délai entre l'affichage et l'envoi, c'est un robot. */
export const DELAI_MINIMAL_MS = 800;

/** Limitation : nombre d'envois acceptés par adresse IP sur la période. */
export const LIMITE_ENVOIS = 6;
export const LIMITE_PERIODE_MS = 10 * 60 * 1000;

/** Taille maximale du corps d'une demande, en caractères. */
export const TAILLE_MAX_DEMANDE = 4096;
