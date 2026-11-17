/**
 * Espaces insécables de la typographie française, pour un texte venu d'ailleurs
 * (titre d'avis, titre de vidéo) : le signe ne passe jamais seul à la ligne.
 * Les mots ne changent pas.
 */
export function insecables(texte: string): string {
  return texte.replace(/ ([?!:;»])/g, ' $1').replace(/« /g, '« ');
}
