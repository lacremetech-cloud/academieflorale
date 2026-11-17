# Ancien générateur (archivé)

`build.py` générait la préversion du site : il écrivait `index.html`, `pages/*.html`, `assets/css/site.css` et `assets/js/site.js`.

Il n'est plus exécuté. Ses fichiers générés sont figés tels quels dans `public/` et servis aux mêmes adresses qu'avant (`/pages/site`, `/pages/webinaire-inscription`, etc.).

Ne relance pas ce script : il écrirait ses fichiers ici, dans `legacy/`, sans effet sur le site. Les pages du tunnel se construisent désormais avec Astro, dans `src/`.
