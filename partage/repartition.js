// @ts-check
/**
 * Test des promesses de la landing : /inscription montre l'une des variantes en
 * test, tirée au sort à parts égales. Les publicités gardent une seule adresse.
 *
 * - Avec un identifiant de clic (le « fbclid » que Meta ajoute à chaque clic sur
 *   une pub), le tirage est constant : le même clic revoit toujours la même
 *   promesse, sans cookie ni donnée gardée.
 * - Sans identifiant, c'est un tirage au hasard à chaque visite.
 *
 * Pour retirer la perdante ou ajouter une nouvelle idée : modifier cette liste
 * (et créer la variante dans src/contenu/landings.ts). La première sert de repli.
 */
export const VARIANTES_EN_TEST = Object.freeze(['90-jours', 'mariages', 'garantie']);

/**
 * Empreinte d'un texte (FNV-1a, 32 bits) : le même texte donne toujours le même nombre.
 * @param {string} texte
 */
export function empreinte(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i += 1) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Brassage final : sans lui, deux identifiants voisins tomberaient trop souvent ensemble.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Choisit la promesse à montrer.
 * @param {string | null | undefined} identifiant identifiant de clic, s'il existe
 * @param {() => number} [hasard] tirage entre 0 et 1 (remplaçable dans les tests)
 * @param {readonly string[]} [variantes]
 * @returns {string} l'identifiant de la variante (fin de l'adresse /inscription/…)
 */
export function choisirVariante(identifiant, hasard = Math.random, variantes = VARIANTES_EN_TEST) {
  const n = variantes.length;
  const index = identifiant ? empreinte(identifiant) % n : Math.min(n - 1, Math.floor(hasard() * n));
  return /** @type {string} */ (variantes[index]);
}
