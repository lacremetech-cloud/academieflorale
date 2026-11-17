/**
 * Avis Trustpilot de l'Académie Florale.
 *
 * Règles : note et nombre d'avis relevés sur le profil le jour de l'intégration ;
 * titres repris tels que publiés (ponctuation et majuscules comprises), avec le
 * nom tel que publié ; aucun avis inventé ni reformulé.
 */
export const TRUSTPILOT = {
  profil: 'https://fr.trustpilot.com/review/academie-florale.fr',
  /** Relevé du 17/11/2026 sur le profil public. */
  releveLe: '2026-11-17',
  note: 4.6,
  /** Étoiles affichées par Trustpilot pour cette note. */
  etoiles: 4.5,
  mention: 'Excellent',
  nombre: 20,
} as const;

export interface Avis {
  /** Note donnée par l'autrice de l'avis, en étoiles. */
  note: number;
  /** Titre de l'avis, tel que publié. */
  titre: string;
  /** Nom de l'autrice, tel que publié. */
  nom: string;
}

/**
 * Avis mis en avant, du plus fort au moins fort : d'abord ceux qui parlent de la
 * promesse (devenir fleuriste indépendante, reconversion) et les plus élogieux.
 * L'ordre de cette liste est l'ordre d'affichage.
 */
export const AVIS: Avis[] = [
  { note: 5, titre: 'Devenir fleuriste indépendante grâce à un accompagnement de qualité', nom: 'Mahault de Rouvray' },
  { note: 5, titre: 'Une reconversion professionnelle rassurante', nom: 'Cécile' },
  { note: 5, titre: "Du rêve à la réalité grâce à l'Académie florale", nom: 'A B' },
  { note: 5, titre: "L'académie florale n'est pas qu'une formation, c'est bien plus!", nom: 'Emilie' },
  { note: 5, titre: "N'hésitez plus !", nom: 'Christelle RIVESLANGE' },
  { note: 5, titre: "J'ai commencé la formation académie et sans regret que du positif", nom: 'Alexandra Noirot' },
  { note: 5, titre: "Je suis en formation à l'Académie Florale, rejoignez nous !", nom: 'Christelle' },
  { note: 5, titre: 'Formation au top!', nom: 'Anne-Laure Lauxerrois' },
  { note: 5, titre: 'Lancez-vous...', nom: 'Jessica Machado' },
  { note: 5, titre: 'formation complète et professionnalisante', nom: 'Elodie Meant' },
  { note: 5, titre: 'Formation au top !', nom: 'Saly Kt' },
  { note: 5, titre: "L' Académie Florale c'est avant tout une communauté", nom: 'Helena Tommasino' },
];
