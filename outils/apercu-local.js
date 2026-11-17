// Aperçu local du site construit, au plus près de Vercel :
// - sert le dossier dist/ avec des adresses sans « .html » (comme « cleanUrls ») ;
// - branche POST /api/lead sur la vraie fonction serveur.
// Usage : npm run apercu   (puis http://localhost:4321)
//
// En local, VERCEL_ENV n'est pas « production » : /api/lead n'écrit donc jamais
// dans ActiveCampaign, sauf pour l'adresse LEAD_TEST_EMAIL si elle est définie.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import lead from '../api/lead.js';
import pays from '../api/pays.js';
import { choisirVariante } from '../partage/repartition.js';

const RACINE = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 4321);
// En local, /api/pays ne connaît pas le pays (pas de géolocalisation) : le
// formulaire se rabat alors sur le fuseau horaire du navigateur.
const FONCTIONS = { '/api/lead': lead, '/api/pays': pays };
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

/** @param {string} chemin */
async function fichier(chemin) {
  const cible = normalize(join(RACINE, chemin));
  if (!cible.startsWith(RACINE)) return null;
  try {
    return (await stat(cible)).isFile() ? cible : null;
  } catch {
    return null;
  }
}

/** @param {import('node:http').IncomingMessage} req */
async function versRequest(req) {
  const morceaux = [];
  for await (const morceau of req) morceaux.push(morceau);
  const corps = Buffer.concat(morceaux);
  const enTetes = new Headers();
  for (const [nom, valeur] of Object.entries(req.headers)) {
    if (typeof valeur === 'string') enTetes.set(nom, valeur);
  }
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: enTetes,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : corps,
  });
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const chemin = decodeURIComponent(url.pathname);

    const fonction = FONCTIONS[chemin];
    if (fonction) {
      const reponse = await fonction.fetch(await versRequest(req));
      res.writeHead(reponse.status, Object.fromEntries(reponse.headers));
      res.end(Buffer.from(await reponse.arrayBuffer()));
      return;
    }

    // Comme le middleware en ligne : /inscription sert une promesse tirée au sort.
    const tirage =
      chemin === '/inscription'
        ? await fichier(`/inscription/${choisirVariante(url.searchParams.get('fbclid'))}.html`)
        : null;
    if (tirage) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
      res.end(await readFile(tirage));
      return;
    }

    // Comme Vercel : /page.html redirige vers /page, en gardant les paramètres.
    if (chemin.endsWith('.html') && (await fichier(chemin))) {
      res.writeHead(308, { Location: (chemin === '/index.html' ? '/' : chemin.slice(0, -5)) + url.search });
      res.end();
      return;
    }

    const cible =
      (chemin === '/' ? await fichier('/index.html') : null) ??
      (await fichier(chemin)) ??
      (await fichier(chemin + '.html')) ??
      (await fichier(join(chemin, 'index.html')));
    if (!cible) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Page introuvable');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(cible)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(cible));
  } catch (erreur) {
    console.error('aperçu local :', erreur instanceof Error ? erreur.message : erreur);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erreur du serveur local');
  }
}).listen(PORT, () => {
  console.log(`Aperçu local : http://localhost:${PORT}  (dossier dist/)`);
});
