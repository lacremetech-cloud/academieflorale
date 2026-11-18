/**
 * Pages ressources : un fichier par page, dans src/contenu/ressources/.
 * Ajouter une page = ajouter un fichier « nom-de-la-page.md » dans ce dossier ;
 * son nom donne son adresse (/ressources/nom-de-la-page) et elle apparaît toute
 * seule dans la bibliothèque de liens (/equipe). Mode d'emploi : LISEZMOI.md du dossier.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const ressources = defineCollection({
  // Les fichiers dont le nom commence par une majuscule ou « _ » (LISEZMOI, brouillons) ne sont pas des pages.
  loader: glob({ pattern: '[a-z0-9]*.md', base: './src/contenu/ressources' }),
  schema: ({ image }) =>
    z.object({
      /** Type de ressource, affiché au-dessus du titre : « Témoignage », « Extrait de coaching »… */
      type: z.string().min(1),
      /** Titre de la page. */
      titre: z.string().min(1),
      /** Une phrase pour l'aperçu du lien (WhatsApp, email) et pour la bibliothèque de liens. */
      description: z.string().min(1),
      /** Vidéo Wistia, facultative. */
      video: z
        .object({
          /** Identifiant du média Wistia. */
          media: z.string().regex(/^[a-z0-9]{8,12}$/),
          /** Image d'aperçu, la même que celle du lecteur. */
          apercu: image(),
          /** Durée arrondie, telle qu'elle s'affiche : « 6 min ». */
          duree: z.string().optional(),
          /** Proportions, si la vidéo n'est pas en 16/9 : « 20 / 9 ». */
          format: z.string().optional(),
        })
        .optional(),
      /** Image de l'aperçu du lien. Par défaut : l'aperçu de la vidéo, sinon une photo de Sybile. */
      partage: image().optional(),
      /** Citations d'élèves, telles que publiées. */
      citations: z
        .array(
          z.object({
            texte: z.string().min(1),
            nom: z.string().min(1),
            situation: z.string().optional(),
            photo: image().optional(),
            /** Adresse de l'avis d'origine (Trustpilot), s'il y en a une. */
            source: z.string().startsWith('https://').optional(),
            /** Note donnée dans cet avis, en étoiles (affichées aux couleurs de Trustpilot). */
            note: z.number().int().min(1).max(5).optional(),
          }),
        )
        .default([]),
      /**
       * Bouton sous le contenu :
       * « appel » mène à la page de réservation, « aucun » n'affiche rien,
       * ou un bouton libre vers une autre adresse.
       */
      bouton: z
        .union([
          z.enum(['appel', 'aucun']),
          z.object({ libelle: z.string().min(1), adresse: z.string().startsWith('https://') }),
        ])
        .default('aucun'),
      /** Rang dans la bibliothèque de liens (les plus petits d'abord). */
      ordre: z.number().default(100),
    }),
});

export const collections = { ressources };
