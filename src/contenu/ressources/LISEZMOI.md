# Pages ressources

Chaque fichier de ce dossier est une page ressource : un témoignage, une vidéo, un texte que l'équipe envoie à la main à une prospecte (WhatsApp, email). Aucune page du tunnel ne pointe vers elles et elles ne sortent pas dans Google.

## Ajouter une page

1. Copier un fichier existant et lui donner le nom de la future adresse, en minuscules et sans accent : `temoignage-prenom.md` donnera `/ressources/temoignage-prenom`.
2. Remplir l'en-tête, entre les deux lignes `---` :

| Champ | Rôle |
| --- | --- |
| `type` | Petite étiquette au-dessus du titre : Témoignage, Coaching… |
| `titre` | Titre de la page |
| `description` | Une phrase pour l'aperçu du lien dans WhatsApp et dans la bibliothèque de liens |
| `video` | Facultatif. `media` : identifiant Wistia ; `apercu` : image d'aperçu rangée dans `src/assets/videos/` ; `duree` : « 6 min » |
| `partage` | Facultatif. Image de l'aperçu du lien, si celle de la vidéo ne convient pas |
| `citations` | Facultatif. `texte`, `nom`, puis au choix `situation`, `photo`, `source` (adresse de l'avis) et `note` (étoiles de l'avis) |
| `bouton` | `appel` (vers la page de réservation), `aucun`, ou un bouton libre : `libelle` et `adresse` |
| `ordre` | Rang dans la bibliothèque de liens, les plus petits d'abord |

3. Sous l'en-tête, écrire le texte de la page s'il y en a un (facultatif).

La page apparaît toute seule dans la bibliothèque de liens : `/equipe`.

## Règles

- Rien d'inventé : un témoignage ou une citation reprend ce que l'élève a réellement dit ou publié, avec son accord.
- Tutoiement, au féminin. Aucun prix, aucune mention de financement.
- Un fichier dont le nom commence par une majuscule (comme celui-ci) n'est pas une page.
