/**
 * Renommage d'un projet issu du boilerplate : scope npm (`@nx-react-nestjs/…`) et noms de
 * docker compose (`nx-react-nestjs-api`…). Logique pure ; les fichiers sont dans init-project.mts.
 */

export const BOILERPLATE_NAME = 'nx-react-nestjs';

const PROJECT_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Nom de projet utilisable comme scope npm et comme nom d'image Docker ; sinon, ce qui ne va pas. */
export function projectNameProblem(name: string): string | undefined {
  if (!PROJECT_NAME.test(name)) {
    return `« ${name} » : minuscules, chiffres et tirets seulement, sans @ ni tiret initial (ex. acme).`;
  }
  if (name === BOILERPLATE_NAME) {
    return `« ${name} » est déjà le nom du boilerplate.`;
  }
  return undefined;
}

/** Scope des imports et alias (`@nx-react-nestjs/`), projet et images compose (`nx-react-nestjs-`). */
const OCCURRENCE = new RegExp(`(?<![\\w-])(@?)${BOILERPLATE_NAME}([/-])`, 'g');

export function renameProject(text: string, name: string): { text: string; replacements: number } {
  let replacements = 0;
  const renamed = text.replace(OCCURRENCE, (_match, at: string, separator: string) => {
    replacements++;
    return `${at}${name}${separator}`;
  });
  return { text: renamed, replacements };
}
