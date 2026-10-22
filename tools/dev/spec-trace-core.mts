/**
 * Traçabilité spec → tests : chaque scénario d'acceptation d'une spec Spec Kit
 * (`specs/NNN-<nom>/spec.md`) porte un identifiant `NNN-US<story>-AS<n>`, et au moins un test
 * le cite dans son titre. Logique pure ; la lecture des fichiers est dans spec-trace.mts.
 */

/**
 * Cycle de vie d'une spec : Draft (en cours, des scénarios peuvent encore attendre leur test),
 * Implemented (tous couverts), Shipped (feature flag supprimé), Retired (fonctionnalité retirée :
 * plus aucun test ne la cite).
 */
const SPEC_STATUSES = ['Draft', 'Implemented', 'Shipped', 'Retired'] as const;
export type SpecStatus = (typeof SPEC_STATUSES)[number];

export interface Scenario {
  id: string;
  text: string;
  /** Scénario retiré (`N. **Retired** …`) : son numéro reste pris, aucun test ne doit le citer. */
  retired: boolean;
}

export interface TestFile {
  path: string;
  content: string;
}

export interface TraceOptions {
  status: SpecStatus;
  /** Exige un test pour chaque scénario actif, même en Draft. */
  strict?: boolean;
}

export interface TraceReport {
  featureId: string;
  status: SpecStatus;
  /** Les scénarios sans test font échouer (sinon, simple information). */
  coverageRequired: boolean;
  rows: { id: string; text: string; retired: boolean; tests: string[] }[];
  uncovered: string[];
  orphans: { id: string; path: string }[];
  retiredCited: { id: string; path: string }[];
  ok: boolean;
}

export function featureIdOf(featureDir: string): string {
  const name = featureDir.replace(/\/+$/, '').split('/').pop() ?? '';
  const match = /^(\d+)-/.exec(name);
  if (!match?.[1]) {
    throw new Error(
      `Le dossier de feature "${featureDir}" n'a pas de préfixe numérique (attendu : NNN-<nom>).`,
    );
  }
  return match[1];
}

export function parseStatus(specMarkdown: string): SpecStatus {
  const value = /^\*\*Status\*\*:\s*(.*?)\s*$/m.exec(specMarkdown)?.[1];
  if (value === undefined) {
    throw new Error(`Ligne **Status** absente (attendu : ${SPEC_STATUSES.join(', ')}).`);
  }
  const status = SPEC_STATUSES.find((candidate) => candidate === value);
  if (!status) {
    throw new Error(`Statut "${value}" inconnu (attendu : ${SPEC_STATUSES.join(', ')}).`);
  }
  return status;
}

/**
 * Scénarios = éléments numérotés de la liste « Acceptance Scenarios » de chaque « User Story N ».
 * Le numéro est celui écrit dans la spec : retirer un scénario ne renumérote pas les suivants.
 */
export function parseScenarios(featureId: string, specMarkdown: string): Scenario[] {
  const scenarios: Scenario[] = [];
  let story: string | undefined;
  let inScenarios = false;

  for (const line of specMarkdown.split('\n')) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      story = /^User Story (\d+)\b/.exec(heading[1] ?? '')?.[1];
      inScenarios = false;
      continue;
    }
    if (story && /^\*\*Acceptance Scenarios\*\*/.test(line)) {
      inScenarios = true;
      continue;
    }
    const item = inScenarios ? /^(\d+)\.\s+(.*)$/.exec(line) : null;
    if (story && item) {
      const text = item[2] ?? '';
      scenarios.push({
        id: `${featureId}-US${story}-AS${item[1]}`,
        text,
        retired: /^\*\*Retired\*\*/.test(text),
      });
    }
  }
  return scenarios;
}

export function traceFeature(
  featureId: string,
  scenarios: Scenario[],
  options: TraceOptions,
  testFiles: TestFile[],
): TraceReport {
  // Une spec retirée l'est en entier : chacun de ses scénarios est retiré.
  const featureRetired = options.status === 'Retired';
  const retiredIds = new Set(
    scenarios.filter((scenario) => featureRetired || scenario.retired).map((s) => s.id),
  );
  const known = new Set(scenarios.map((scenario) => scenario.id));
  const idPattern = new RegExp(`\\b${featureId}-US\\d+-AS\\d+\\b`, 'g');
  const testsById = new Map<string, Set<string>>();
  const orphans: TraceReport['orphans'] = [];
  const retiredCited: TraceReport['retiredCited'] = [];

  for (const file of testFiles) {
    for (const id of new Set(file.content.match(idPattern) ?? [])) {
      if (!known.has(id)) {
        orphans.push({ id, path: file.path });
        continue;
      }
      testsById.set(id, (testsById.get(id) ?? new Set()).add(file.path));
      if (retiredIds.has(id)) retiredCited.push({ id, path: file.path });
    }
  }

  const rows = scenarios.map((scenario) => ({
    id: scenario.id,
    text: scenario.text,
    retired: retiredIds.has(scenario.id),
    tests: [...(testsById.get(scenario.id) ?? [])].sort(),
  }));
  const active = rows.filter((row) => !row.retired);
  const uncovered = active.filter((row) => row.tests.length === 0).map((row) => row.id);
  const byIdThenPath = (a: { id: string; path: string }, b: { id: string; path: string }) =>
    a.id.localeCompare(b.id) || a.path.localeCompare(b.path);
  orphans.sort(byIdThenPath);
  retiredCited.sort(byIdThenPath);

  const coverageRequired =
    !featureRetired && (options.strict === true || options.status !== 'Draft');
  const coverageOk = !coverageRequired || (active.length > 0 && uncovered.length === 0);

  return {
    featureId,
    status: options.status,
    coverageRequired,
    rows,
    uncovered,
    orphans,
    retiredCited,
    ok: coverageOk && orphans.length === 0 && retiredCited.length === 0,
  };
}

/**
 * Dérive probable : un diff (`git diff -U0`) modifie des lignes de test qui citent un scénario
 * d'une feature, sans que le `spec.md` de cette feature figure parmi les fichiers modifiés.
 * Simple signal pour la revue : renommer ou refactorer un test ne change pas le comportement.
 */
export function driftedFeatures(
  diff: string,
  changedPaths: string[],
): { featureId: string; paths: string[] }[] {
  const specChanged = new Set(
    changedPaths.flatMap((path) => /^specs\/(\d+)-[^/]+\/spec\.md$/.exec(path)?.[1] ?? []),
  );
  const pathsByFeature = new Map<string, Set<string>>();
  let oldPath: string | undefined;
  let path: string | undefined;

  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) {
      oldPath = line.slice(4).replace(/^a\//, '');
      continue;
    }
    if (line.startsWith('+++ ')) {
      const newPath = line.slice(4);
      path = newPath === '/dev/null' ? oldPath : newPath.replace(/^b\//, '');
      continue;
    }
    if (!path || !/^[+-]/.test(line)) continue;
    for (const match of line.matchAll(/\b(\d+)-US\d+-AS\d+\b/g)) {
      const featureId = match[1] ?? '';
      if (specChanged.has(featureId)) continue;
      pathsByFeature.set(featureId, (pathsByFeature.get(featureId) ?? new Set()).add(path));
    }
  }

  return [...pathsByFeature]
    .map(([featureId, paths]) => ({ featureId, paths: [...paths].sort() }))
    .sort((a, b) => a.featureId.localeCompare(b.featureId));
}
