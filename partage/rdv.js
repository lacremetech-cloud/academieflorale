// @ts-check
/**
 * Retour d'iClosed après une réservation. iClosed redirige vers la page merci call
 * en ajoutant à l'adresse les détails de la réservation, dont le nom, l'email et le
 * téléphone de la prospecte. On n'en garde que ce que la page affiche : un
 * identifiant de réservation, le prénom et l'instant de l'appel.
 * Fonctions pures : aucune dépendance au navigateur, aucun secret.
 */
import { CLES_UTM, nettoyerPrenom, prenomAffichable } from './validation.js';

/** Paramètres ajoutés par iClosed dont la présence signale une réservation. */
const SIGNES = ['previewId', 'invitee_uuid', 'event_start_time'];

/**
 * Instant de l'appel, seulement s'il est sans ambiguïté : une date qui porte son
 * décalage horaire (« Z » ou « +01:00 »). Une heure sans décalage pourrait être lue
 * dans le mauvais fuseau : mieux vaut ne rien afficher qu'une heure fausse.
 * @param {unknown} brut
 * @returns {string} l'instant au format ISO (UTC), ou ''
 */
export function instantSur(brut) {
  if (typeof brut !== 'string') return '';
  const texte = brut
    .trim()
    // Dans une adresse, un « + » non encodé arrive sous la forme d'une espace.
    .replace(/ (\d{2}:?\d{2})$/, '+$1')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.test(texte)) return '';
  const date = new Date(texte);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * Ce qu'iClosed a transmis dans l'adresse, réduit à ce que la page affiche.
 * @param {string} recherche partie « ?… » de l'adresse
 * @returns {{ id: string, prenom: string, debut: string, details: boolean } | null} null sans réservation
 */
export function lireRetourIclosed(recherche) {
  const parametres = new URLSearchParams(recherche);
  if (!SIGNES.some((cle) => parametres.get(cle))) return null;
  const appel = parametres.get('previewId') ?? '';
  // Le prénom : le premier mot du nom complet, une fois celui-ci nettoyé.
  const premierMot = nettoyerPrenom(parametres.get('invitee_full_name') ?? '').split(' ')[0] ?? '';
  return {
    id: (appel || parametres.get('invitee_uuid') || '').replace(/[^\w-]/g, '').slice(0, 80),
    prenom: prenomAffichable(premierMot),
    debut: instantSur(parametres.get('event_start_time')),
    // Le code « booking confirmation » d'iClosed s'appuie sur l'identifiant de l'appel.
    details: appel !== '',
  };
}

/**
 * « vendredi 20 novembre à 18:00 », à l'heure de l'appareil de la visiteuse.
 * @param {string} iso instant renvoyé par instantSur
 * @param {string} [fuseau] pour les tests ; par défaut, celui de l'appareil
 * @returns {string} '' si l'instant est inutilisable
 */
export function formaterRdv(iso, fuseau) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    ...(fuseau ? { timeZone: fuseau } : {}),
  }).format(date);
}

/**
 * La partie « ?… » de l'adresse, débarrassée de tout ce qu'iClosed y a ajouté :
 * seuls les paramètres d'attribution (UTM, fbclid) restent.
 * @param {string} recherche
 * @returns {string} '' ou « ?utm_source=… »
 */
export function rechercheSansDonnees(recherche) {
  const recus = new URLSearchParams(recherche);
  const gardes = new URLSearchParams();
  for (const cle of CLES_UTM) {
    const valeur = recus.get(cle);
    if (valeur) gardes.set(cle, valeur);
  }
  const suite = gardes.toString();
  return suite ? `?${suite}` : '';
}
