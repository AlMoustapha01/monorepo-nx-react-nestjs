import { existsSync } from 'node:fs';

/**
 * En dev (process lancé depuis la racine du repo) : apps/api/.env, puis le .env commun de la
 * racine. Une variable déjà définie n'est pas remplacée : le shell, puis le fichier de l'app,
 * l'emportent. En production, aucun fichier : l'environnement du conteneur suffit.
 */
export function loadEnvFiles(): void {
  for (const file of ['apps/api/.env', '.env']) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    }
  }
}
