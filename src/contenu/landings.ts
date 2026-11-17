/**
 * Variantes de la landing : une par promesse, chacune à sa propre adresse
 * (/inscription/90-jours, /inscription/mariages…).
 * Ajouter une variante = ajouter un objet à cette liste, sans toucher au gabarit.
 *
 * /inscription tire au sort l'une des variantes en test (partage/repartition.js).
 * La première de cette liste est aussi servie à /inscription en repli.
 *
 * Dans « titre », un passage entre astérisques est mis en valeur (orange).
 * Tout chiffre cité doit pouvoir se prouver (script de la VSL, plaquette, garantie).
 */
export interface Landing {
  /** Fin de l'adresse : 'mariages' donne /inscription/mariages. */
  slug: string;
  /** « meta » pose le tag « VSL Meta Ads » sur le lead. Vide : aucun tag de source. */
  source: 'meta' | '';
  /** Petite ligne au-dessus du titre : ce que la visiteuse reçoit. */
  surtitre: string;
  /** La grosse promesse. */
  titre: string;
  /** La sous-promesse : elle répond aux objections. */
  sousTitre: string;
  /** Repère chiffré posé sur la photo (facultatif). */
  repere?: string;
  /** Libellé du bouton. */
  bouton: string;
  /** Demande aussi le téléphone. */
  avecTelephone: boolean;
  /** Titre de l'onglet et description (aperçu du lien). */
  titrePage: string;
  description: string;
}

const COMMUN = {
  source: 'meta',
  surtitre: 'La vidéo offerte de Sybile Loppé',
  repere: 'Un mariage : 1 000 à 3 000 € de chiffre d’affaires',
  bouton: 'Je regarde la vidéo',
  // Téléphone demandé : l'équipe rappelle les inscrites (décision du 17/11/2026).
  avecTelephone: true,
  titrePage: 'Deviens fleuriste indépendante · Académie Florale',
  description: 'La vidéo offerte de Sybile Loppé : devenir fleuriste indépendante depuis chez toi, sans CAP et sans boutique.',
} as const;

/**
 * Une seule promesse, retenue le 17/11/2026 : « fleuriste indépendante en 90 jours,
 * depuis chez toi » (c'est aussi la promesse d'ouverture de la VSL).
 * Elle se décline en trois formulations, testées à parts égales.
 */
export const LANDINGS: Landing[] = [
  {
    // La formulation d'origine. Sous-promesse : la légitimité (CAP, débutante).
    ...COMMUN,
    slug: '90-jours',
    titre: 'Deviens fleuriste indépendante en *90 jours*, depuis chez toi',
    sousTitre: 'Sans CAP, sans boutique, même si tu n’as jamais fait un bouquet de ta vie.',
  },
  {
    // Déclinaison « le cadre » : elle attend un plan, des étapes, une date, et quelqu'un qui la guide.
    ...COMMUN,
    slug: '90-jours-plan',
    titre: 'Ton plan en *90 jours* pour devenir fleuriste indépendante, depuis chez toi',
    sousTitre: 'Étape par étape avec Sybile : sans CAP, sans boutique, même en partant de zéro.',
  },
  {
    // Déclinaison « le temps » : encore en poste, des enfants, la peur de tout quitter.
    ...COMMUN,
    slug: '90-jours-rythme',
    titre: 'Deviens fleuriste indépendante en *90 jours*, à ton rythme et depuis chez toi',
    sousTitre: 'Sans CAP, sans boutique, et sans quitter ton emploi pour te lancer.',
  },
];
