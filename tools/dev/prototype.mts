/**
 * Prototype d'une fonctionnalité (/speckit-prototype), pages HTML dans specs/NNN-<nom>/prototypes/ :
 *   pnpm prototype specs/004-checkout             → compile styles.css depuis le thème de libs/web/ui
 *   pnpm prototype specs/004-checkout --capture   → puis remplace captures/ (desktop et mobile)
 * Affiche l'URL de index.html, à ouvrir dans le navigateur : aucun serveur.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  VIEWPORTS,
  captureTargets,
  capturesViewportOnly,
  entryCss,
  linkProblems,
  localUrls,
  packageImports,
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

const html = Object.fromEntries(pages.map((page) => [page, readFileSync(join(dir, page), 'utf8')]));
const { dead, orphans } = linkProblems(html);
if (orphans.length > 0) {
  console.warn(`Pages vers lesquelles aucune autre ne mène : ${orphans.join(', ')}`);
}
if (dead.length > 0) {
  console.error(`Liens vers des pages absentes :\n  ${dead.join('\n  ')}`);
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

// Les fichiers d'un paquet importé par le thème (polices @fontsource) restent visés en relatif
// (`url(./files/…)`) : on les copie à côté de styles.css, sinon la page retombe sur une autre police.
const requireFromTheme = createRequire(resolve(THEME));
const packageDirs = packageImports(readFileSync(THEME, 'utf8')).flatMap((name) => {
  try {
    return [dirname(requireFromTheme.resolve(name))];
  } catch {
    return [];
  }
});
for (const url of localUrls(readFileSync(join(dir, 'styles.css'), 'utf8'))) {
  const source = packageDirs
    .map((packageDir) => join(packageDir, url))
    .find((path) => existsSync(path));
  if (source) {
    mkdirSync(dirname(join(dir, url)), { recursive: true });
    copyFileSync(source, join(dir, url));
  }
}

if (capture) {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const missing = /Executable doesn't exist/.test((error as Error).message);
    console.error(
      missing
        ? 'Chromium manquant : pnpm exec playwright install chromium'
        : (error as Error).message,
    );
    process.exit(1);
  }
  // Les captures s'écrivent à part, puis remplacent les anciennes d'un coup : un échec garde les
  // anciennes, et celles d'une page retirée ne survivent pas.
  const captures = join(dir, 'captures');
  const fresh = join(dir, '.captures.tmp');
  rmSync(fresh, { recursive: true, force: true });
  mkdirSync(fresh);
  try {
    for (const target of captureTargets(pages)) {
      const page = await browser.newPage({ viewport: VIEWPORTS[target.viewport] });
      await page.goto(pathToFileURL(resolve(dir, target.page)).href);
      await page.screenshot({
        path: join(fresh, basename(target.file)),
        fullPage: !capturesViewportOnly(html[target.page]),
      });
      await page.close();
    }
    rmSync(captures, { recursive: true, force: true });
    renameSync(fresh, captures);
  } finally {
    rmSync(fresh, { recursive: true, force: true });
    await browser.close();
  }
  console.log(`${pages.length * Object.keys(VIEWPORTS).length} captures dans ${captures}/`);
}

console.log(pathToFileURL(resolve(dir, 'index.html')).href);
