/**
 * Prototype d'une fonctionnalité (/speckit-prototype) : pages HTML statiques à plat dans
 * specs/NNN-<nom>/prototypes/, index.html en entrée, styles.css compilé depuis le vrai thème de
 * libs/web/ui, captures par page et par format dans captures/. Logique pure ; les fichiers, la
 * compilation et les captures sont dans prototype.mts.
 */

/** Formats des captures : un écran de bureau courant et un téléphone courant. */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

export type Viewport = keyof typeof VIEWPORTS;

/** Dossier des prototypes d'une fonctionnalité, à partir de son dossier ou de celui des prototypes. */
export function prototypesDir(featurePath: string): string {
  const match = /^(specs\/\d{3}-[a-z0-9-]+?)(?:\/prototypes)?\/?$/.exec(featurePath);
  if (!match) {
    throw new Error(
      `« ${featurePath} » n'est pas le dossier d'une fonctionnalité : specs/NNN-<name> attendu.`,
    );
  }
  return `${match[1]}/prototypes`;
}

/** Feuille d'entrée de Tailwind : le thème de l'app, et les classes des pages du prototype. */
export function entryCss(themeRelativePath: string): string {
  return `@import '${themeRelativePath}';\n@source './*.html';\n`;
}

/** Pages du prototype parmi les fichiers de son dossier : index.html d'abord, puis par nom. */
export function pageFiles(names: string[]): string[] {
  if (!names.includes('index.html')) {
    throw new Error("Le prototype n'a pas de page index.html, son point d'entrée.");
  }
  const others = names.filter((name) => name.endsWith('.html') && name !== 'index.html').sort();
  return ['index.html', ...others];
}

/** Une capture par page et par format, nommée d'après la page : captures/cart-mobile.png. */
export function captureTargets(
  pages: string[],
): { page: string; viewport: Viewport; file: string }[] {
  return pages.flatMap((page) =>
    (Object.keys(VIEWPORTS) as Viewport[]).map((viewport) => ({
      page,
      viewport,
      file: `captures/${page.replace(/\.html$/, '')}-${viewport}.png`,
    })),
  );
}

/** Paquets importés par le thème (`@import '@fontsource-variable/inter'`), sans les imports relatifs. */
export function packageImports(themeCss: string): string[] {
  return [...themeCss.matchAll(/@import\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith('.') && !path.startsWith('/'));
}

/**
 * Fichiers locaux visés par la feuille compilée (`url(./files/inter-latin.woff2)`). Tailwind laisse
 * ces chemins relatifs au paquet importé : ils sont à copier à côté de styles.css.
 */
export function localUrls(css: string): string[] {
  const urls = [...css.matchAll(/url\(\s*['"]?(\.\/[^'")]+)['"]?\s*\)/g)].map((match) => match[1]);
  return [...new Set(urls)];
}
