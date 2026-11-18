/**
 * Réglages du site, côté pages. Un seul endroit pour ce qui se répète.
 * (Les réglages du serveur — tags, champs ActiveCampaign — sont dans serveur/reglages.js.)
 */
import { ICLOSED_VSL } from '../partage/iclosed.js';
import { WISTIA_VSL } from '../partage/wistia.js';

export const MARQUE = 'Académie Florale';

/**
 * Liens du pied de page. Un lien sans adresse n'est pas affiché :
 * mieux vaut un lien absent qu'un lien mort.
 * Adresses relevées sur le tunnel actuel le 17/11/2026, à confirmer.
 */
export const LIENS_LEGAUX: { libelle: string; adresse: string }[] = [
  { libelle: 'CGV', adresse: 'https://academie-florale.fr/cgv' },
  { libelle: 'Mentions légales', adresse: 'https://academie-florale.fr/mentions-l%C3%A9gales' },
  // Politique de confidentialité : adresse à fournir.
  { libelle: 'Confidentialité', adresse: '' },
];

/** Mention de non-affiliation à Meta (reprise de la préversion, accents rétablis). */
export const MENTION_META =
  'Ce site n’est pas affilié à Facebook ni à Meta Platforms, Inc. « FACEBOOK » est une marque déposée de Meta Platforms, Inc.';

/**
 * Vidéos Wistia (compte sybile-academieflorale).
 * La VSL est le même média que sur l'ancien tunnel (« VSL VF », 10 min 31) :
 * ses statistiques continuent ainsi d'alimenter le cockpit.
 */
export const WISTIA = {
  vsl: WISTIA_VSL,
  /** Page merci call, étape 1 : comment confirmer son rendez-vous (1 min 48). */
  confirmation: 'ar6g31iwuz',
  /** Page merci call, étape 2 : présentation de l'Académie Florale (15 min). */
  presentation: 'obb1ev2cwc',
} as const;

/**
 * Events iClosed. Celui du tunnel VSL est l'event de l'ancienne page call
 * (« Appel de candidature ») ; son adresse s'écrit dans partage/iclosed.js.
 */
export const ICLOSED = {
  vsl: { event: `${ICLOSED_VSL.compte}/${ICLOSED_VSL.event}`, titre: ICLOSED_VSL.titre },
} as const;

/** Adresses du tunnel, dans l'ordre du parcours. */
export const CHEMINS = {
  inscription: '/inscription',
  video: '/video',
  call: '/call',
  confirmation: '/confirmation',
  /** Pages ressources, hors tunnel : /ressources/<nom>. */
  ressources: '/ressources',
  /** Bibliothèque de liens, réservée à l'équipe. */
  equipe: '/equipe',
} as const;
