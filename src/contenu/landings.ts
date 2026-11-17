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
  bouton: 'Je regarde la vidéo',
  // Téléphone demandé : l'équipe rappelle les inscrites (décision du 17/11/2026).
  avecTelephone: true,
  titrePage: 'Deviens fleuriste indépendante · Académie Florale',
  description: 'La vidéo offerte de Sybile Loppé : devenir fleuriste indépendante depuis chez toi, sans CAP et sans boutique.',
} as const;

export const LANDINGS: Landing[] = [
  {
    // Angle « transformation rapide » : la promesse d'ouverture de la VSL.
    ...COMMUN,
    slug: '90-jours',
    titre: 'Deviens fleuriste indépendante en *90 jours*, depuis chez toi',
    sousTitre: 'Sans CAP, sans boutique, même si tu n’as jamais fait un bouquet de ta vie.',
    repere: 'Un mariage : 1 000 à 3 000 € de chiffre d’affaires',
  },
  {
    // Angle « argent concret » : le chiffre d'affaires d'un mariage, cité dans la VSL.
    ...COMMUN,
    slug: 'mariages',
    titre: 'Un mariage fleuri, c’est *1 000 à 3 000 €* de chiffre d’affaires',
    sousTitre: 'Apprends à en vivre depuis chez toi : sans CAP, sans boutique, même en partant de zéro.',
    repere: 'Tes premiers clients en 90 jours',
  },
  {
    // Angle « garantie » : formulation exacte de la garantie de l'Académie.
    ...COMMUN,
    slug: 'garantie',
    surtitre: 'Sans CAP · Depuis chez toi · En partant de zéro',
    titre: 'Tes *10 000 premiers euros* de fleuriste indépendante, en un an',
    sousTitre:
      'Si tu n’as pas atteint 10 000 € de chiffre d’affaires au bout d’un an, l’Académie continue de t’accompagner gratuitement.',
  },
];
