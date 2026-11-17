/**
 * Témoignages d'élèves de l'Académie Florale, repris de la page de confirmation du
 * tunnel d'origine : mêmes prénoms, mêmes textes, mêmes vidéos.
 * Ne rien ajouter ici sans l'accord de l'élève concernée.
 */
import alexane from '../assets/temoignages/alexane.jpg';
import elisabeth from '../assets/temoignages/elisabeth.jpg';
import magalie from '../assets/temoignages/magalie.jpg';
import apercuAmelie from '../assets/videos/temoignage-amelie.jpg';
import apercuAude from '../assets/videos/temoignage-aude.jpg';
import apercuClaire from '../assets/videos/temoignage-claire.jpg';

export interface Temoignage {
  nom: string;
  situation: string;
  citation: string;
  photo: ImageMetadata;
}

export const TEMOIGNAGES: Temoignage[] = [
  {
    nom: 'Alexane V.',
    situation: 'En reconversion · Future designer floral',
    citation:
      'Après plusieurs années en banque et assurances, j’ai décidé de me lancer dans l’aventure florale. Même novice, je veux créer du beau et donner du sens à mon travail.',
    photo: alexane,
  },
  {
    nom: 'Élisabeth B.',
    situation: 'En reconversion · Future fleuriste passionnée',
    citation:
      'Cela faisait des années que je voulais devenir fleuriste. Cette formation est enfin l’occasion de penser à moi, de m’épanouir et de réussir quelque chose qui me passionne.',
    photo: elisabeth,
  },
  {
    nom: 'Magalie R.',
    situation: 'Ancienne fleuriste · En reconversion entrepreneuriale',
    citation:
      'Après 6 ans de pause, j’ai réalisé que la fleur était toujours ma vraie passion. Cette formation me permet de me perfectionner et de construire enfin mon entreprise.',
    photo: magalie,
  },
];

export interface TemoignageVideo {
  prenom: string;
  /** Identifiant du média Wistia. */
  media: string;
  /** Durée arrondie, telle qu'elle s'affiche. */
  duree: string;
  apercu: ImageMetadata;
}

/** Entretiens vidéo (Wistia), durées relevées le 17/11/2026. */
export const TEMOIGNAGES_VIDEO: TemoignageVideo[] = [
  { prenom: 'Amélie', media: '2tyxz8k4ma', duree: '6 min', apercu: apercuAmelie },
  { prenom: 'Claire', media: '2j35b9rlbf', duree: '14 min', apercu: apercuClaire },
  { prenom: 'Aude', media: 'oj5g4xe2vn', duree: '5 min', apercu: apercuAude },
];
