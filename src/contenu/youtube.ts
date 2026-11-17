/**
 * Chaîne YouTube de Sybile, proposée sur la page merci call en attendant l'appel.
 * Titres repris tels que publiés, relevés le 17/11/2026 : pour ajouter une vidéo,
 * ajoute une ligne ici et sa vignette dans src/assets/youtube/.
 * La première vidéo de la liste est mise en avant (plus grande).
 */
import banquiere from '../assets/youtube/acvQDSuyI2w.jpg';
import mariage from '../assets/youtube/g8mU8K1vtwI.jpg';
import cap from '../assets/youtube/lxjnU7CmR0Y.jpg';
import revenus from '../assets/youtube/vkMIwztTJ_o.jpg';
import jungle from '../assets/youtube/ZX8dTiyPE-M.jpg';

export const CHAINE_YOUTUBE = {
  nom: 'Sybile Loppé - Académie Florale',
  adresse: 'https://www.youtube.com/@academie-florale',
} as const;

export interface VideoYoutube {
  /** Identifiant de la vidéo : youtube.com/watch?v=<id>. */
  id: string;
  titre: string;
  vignette: ImageMetadata;
}

export const VIDEOS_YOUTUBE: VideoYoutube[] = [
  {
    id: 'g8mU8K1vtwI',
    titre: "J'ai accompagné une élève pendant 24h sur un mariage (voici ce qui s'est passé)",
    vignette: mariage,
  },
  {
    id: 'acvQDSuyI2w',
    titre: 'Banquière le lundi, fleuriste de mariage le week-end (1 jour avec mon élève)',
    vignette: banquiere,
  },
  { id: 'lxjnU7CmR0Y', titre: 'CAP fleuriste : est-ce vraiment obligatoire pour se lancer ?', vignette: cap },
  { id: 'vkMIwztTJ_o', titre: 'Combien gagne VRAIMENT une fleuriste indépendante ? (les 3 étapes)', vignette: revenus },
  {
    id: 'ZX8dTiyPE-M',
    titre: "J'ai transformé cette chocolaterie en jungle tropicale (étape par étape)",
    vignette: jungle,
  },
];
