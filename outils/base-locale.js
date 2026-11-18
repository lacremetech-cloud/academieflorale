// Base de compteurs locale, en mémoire : elle imite l'API REST d'Upstash Redis
// (une suite de commandes envoyée à /pipeline) pour l'aperçu local. Elle sert à
// essayer les notes, le registre des ventes et les compteurs sans toucher à la
// vraie base. Tout est perdu à l'arrêt du serveur local.

/** Adresse fictive de la base locale : aucune requête ne part réellement vers elle. */
export const ADRESSE_BASE_LOCALE = 'https://base-locale.invalid';

/** @returns {(commandes: unknown) => Response} */
export function creerBaseLocale() {
  /** @type {Map<string, string>} */
  const textes = new Map();
  /** @type {Map<string, Map<string, string>>} */
  const tables = new Map();
  /** @type {Map<string, Set<string>>} */
  const ensembles = new Map();
  /** @param {string} cle */
  const table = (cle) => tables.get(cle) ?? tables.set(cle, new Map()).get(cle);
  /** @param {string} cle */
  const ensemble = (cle) => ensembles.get(cle) ?? ensembles.set(cle, new Set()).get(cle);

  /** @param {string[]} commande */
  const executer = ([nom, cle = '', ...reste]) => {
    switch (String(nom).toUpperCase()) {
      case 'INCR': {
        const valeur = Number(textes.get(cle) ?? 0) + 1;
        textes.set(cle, String(valeur));
        return valeur;
      }
      case 'MGET':
        return [cle, ...reste].map((uneCle) => textes.get(uneCle) ?? null);
      case 'SADD':
        return reste.filter((membre) => !ensemble(cle)?.has(membre) && ensemble(cle)?.add(membre)).length;
      case 'SMEMBERS':
        return [...(ensemble(cle) ?? [])];
      case 'HSET':
        table(cle)?.set(String(reste[0]), String(reste[1]));
        return 1;
      case 'HDEL':
        return table(cle)?.delete(String(reste[0])) ? 1 : 0;
      case 'HMGET':
        return reste.map((champ) => table(cle)?.get(champ) ?? null);
      case 'HGETALL':
        // Comme Upstash : « champ, valeur, champ, valeur… ».
        return [...(table(cle) ?? [])].flat();
      default:
        throw new Error(`commande inconnue : ${nom}`);
    }
  };

  return (commandes) => {
    const resultats = (Array.isArray(commandes) ? commandes : []).map((commande) => {
      try {
        return { result: executer(commande.map(String)) };
      } catch (erreur) {
        return { error: erreur instanceof Error ? erreur.message : 'erreur' };
      }
    });
    return new Response(JSON.stringify(resultats), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
