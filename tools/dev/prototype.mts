/**
 * Prototype d'une fonctionnalité (/speckit-prototype), pages HTML dans specs/NNN-<nom>/prototypes/ :
 *   pnpm prototype specs/004-checkout             → compile styles.css depuis le thème de libs/web/ui
 *   pnpm prototype specs/004-checkout --capture   → puis remplace captures/ (desktop et mobile)
 * Affiche l'URL de index.html, à ouvrir dans le navigateur : aucun serveur.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  VIEWPORTS,
  captureTargets,
  entryCss,
  pageFiles,
  prototypesDir,
} from './prototype-core.mts';

const THEME = 'libs/web/ui/src/lib/styles/theme.css';

const args = process.argv.slice(2);
const capture = args.includes('--capture');
const featurePath = args.find((arg) => !arg.startsWith('--')) ?? '';

let dir: string;
let pages: string[];
try {
  dir = prototypesDir(featurePath);
  pages = pageFiles(readdirSync(dir));
} catch (error) {
  const message =
    (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? `${featurePath} n'a pas de dossier prototypes/.`
      : (error as Error).message;
  console.error(`Usage : pnpm prototype <specs/NNN-nom> [--capture]\n${message}`);
  process.exit(1);
}

// L'entrée vit à côté des pages, le temps de la compilation : `@source './*.html'` les vise.
const entry = join(dir, '.styles.entry.css');
writeFileSync(entry, entryCss(relative(dir, THEME)));
try {
  execFileSync(
    'pnpm',
    ['exec', 'tailwindcss', '-i', entry, '-o', join(dir, 'styles.css'), '--minify'],
    {
      stdio: 'inherit',
    },
  );
} finally {
  rmSync(entry, { force: true });
}

if (capture) {
  // Les captures d'une page retirée ne doivent pas survivre.
  rmSync(join(dir, 'captures'), { recursive: true, force: true });
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    console.error('Chromium manquant : pnpm exec playwright install chromium');
    process.exit(1);
  }
  try {
    for (const target of captureTargets(pages)) {
      const page = await browser.newPage({ viewport: VIEWPORTS[target.viewport] });
      await page.goto(pathToFileURL(resolve(dir, target.page)).href);
      await page.screenshot({ path: join(dir, target.file), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(
    `${pages.length * Object.keys(VIEWPORTS).length} captures dans ${join(dir, 'captures')}/`,
  );
}

console.log(pathToFileURL(resolve(dir, 'index.html')).href);
