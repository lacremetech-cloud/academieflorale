/**
 * Réglages du site, côté pages. Un seul endroit pour ce qui se répète.
 * (Les réglages du serveur — tags, champs ActiveCampaign — sont dans serveur/reglages.js.)
 */

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

/** Adresses du tunnel, dans l'ordre du parcours. */
export const CHEMINS = {
  inscription: '/inscription',
  video: '/video',
  call: '/call',
  confirmation: '/confirmation',
} as const;
