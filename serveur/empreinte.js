// @ts-check
/**
 * Empreintes (SHA-256) des coordonnées d'une personne, côté serveur seulement.
 * - Le cockpit range l'attribution d'une inscrite sous l'empreinte de son email :
 *   la base ne contient donc pas son adresse.
 * - Meta attend ces mêmes empreintes dans l'API de conversion (jamais l'email ni
 *   le téléphone en clair), après une mise en forme précise.
 */
import { createHash } from 'node:crypto';

/** @param {string} texte */
export const hacher = (texte) => createHash('sha256').update(texte, 'utf8').digest('hex');

/**
 * Email : sans espaces autour, en minuscules.
 * @param {unknown} email
 * @returns {string} '' si l'email est vide
 */
export function empreinteEmail(email) {
  const propre = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return propre ? hacher(propre) : '';
}

/**
 * Téléphone : les chiffres seulement, indicatif du pays compris, sans « + » ni zéro en tête.
 * @param {unknown} telephone au format international (« +33612345678 »)
 * @returns {string}
 */
export function empreinteTelephone(telephone) {
  const chiffres = typeof telephone === 'string' ? telephone.replace(/\D/g, '').replace(/^0+/, '') : '';
  return chiffres.length >= 8 ? hacher(chiffres) : '';
}

/**
 * Prénom : en minuscules, sans espaces autour.
 * @param {unknown} prenom
 * @returns {string}
 */
export function empreintePrenom(prenom) {
  const propre = typeof prenom === 'string' ? prenom.trim().toLowerCase() : '';
  return propre ? hacher(propre) : '';
}
