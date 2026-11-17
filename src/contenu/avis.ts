/**
 * Avis Trustpilot de l'Académie Florale.
 *
 * Règles : note et nombre d'avis relevés sur le profil le jour de l'intégration ;
 * titres repris tels que publiés (ponctuation et majuscules comprises), avec le
 * nom et la date tels que publiés ; aucun avis inventé ni reformulé. Le texte des
 * avis n'est pas recopié : il se lit sur Trustpilot.
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
  /** Date de publication (AAAA-MM-JJ). */
  date: string;
}

/**
 * Avis mis en avant, du plus fort au moins fort : d'abord ceux qui parlent de la
 * promesse (devenir fleuriste indépendante, reconversion) et les plus élogieux.
 * L'ordre de cette liste est l'ordre d'affichage (landing).
 */
export const AVIS: Avis[] = [
  { note: 5, titre: 'Devenir fleuriste indépendante grâce à un accompagnement de qualité', nom: 'Mahault de Rouvray', date: '2026-09-23' },
  { note: 5, titre: 'Une reconversion professionnelle rassurante', nom: 'Cécile', date: '2026-09-30' },
  { note: 5, titre: "Du rêve à la réalité grâce à l'Académie florale", nom: 'A B', date: '2026-06-11' },
  { note: 5, titre: "L'académie florale n'est pas qu'une formation, c'est bien plus!", nom: 'Emilie', date: '2026-09-08' },
  { note: 5, titre: "N'hésitez plus !", nom: 'Christelle RIVESLANGE', date: '2026-09-07' },
  { note: 5, titre: "J'ai commencé la formation académie et sans regret que du positif", nom: 'Alexandra Noirot', date: '2026-04-16' },
  { note: 5, titre: "Je suis en formation à l'Académie Florale, rejoignez nous !", nom: 'Christelle', date: '2026-04-01' },
  { note: 5, titre: 'Formation au top!', nom: 'Anne-Laure Lauxerrois', date: '2026-09-12' },
  { note: 5, titre: 'Lancez-vous...', nom: 'Jessica Machado', date: '2026-06-25' },
  { note: 5, titre: 'formation complète et professionnalisante', nom: 'Elodie Meant', date: '2026-09-17' },
  { note: 5, titre: 'Formation au top !', nom: 'Saly Kt', date: '2026-04-10' },
  { note: 5, titre: "L' Académie Florale c'est avant tout une communauté", nom: 'Helena Tommasino', date: '2026-09-09' },
];

/**
 * Les autres avis publiés sur le profil au 17/11/2026 (tous à 5 étoiles).
 * Avec les précédents, ils forment le mur d'avis de la page merci call.
 */
export const AUTRES_AVIS: Avis[] = [
  { note: 5, titre: "L 'académie florale un challenge bienveillant", nom: 'Esther', date: '2026-09-08' },
  { note: 5, titre: 'formation que je recommande', nom: 'Stephanie Renard', date: '2026-09-10' },
  { note: 5, titre: 'Formatrice à l’écoute', nom: 'amelie bortolin', date: '2026-04-10' },
  { note: 5, titre: 'Ça fait bientôt 4 mois que j’ai rejoint…', nom: 'Alizia teolis', date: '2026-09-07' },
  { note: 5, titre: 'Formation complète', nom: 'Sylvia', date: '2026-09-07' },
  { note: 5, titre: 'L’académie florale', nom: 'Christelle', date: '2026-10-07' },
  { note: 5, titre: "L'académie florale 🌷", nom: 'Elisa Ditz', date: '2026-06-12' },
  { note: 5, titre: "L'académie florale", nom: 'Emmanuelle Roure', date: '2026-09-07' },
];

/** Tous les avis du profil, les plus parlants d'abord. */
export const TOUS_LES_AVIS: Avis[] = [...AVIS, ...AUTRES_AVIS];
