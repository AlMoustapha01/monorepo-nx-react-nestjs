/**
 * Traçabilité spec → tests : chaque scénario d'acceptation d'une spec Spec Kit
 * (`specs/NNN-<nom>/spec.md`) porte un identifiant `NNN-US<story>-AS<n>`, et au moins un test
 * le cite dans son titre. Logique pure ; la lecture des fichiers est dans spec-trace.mts.
 */

export interface Scenario {
  id: string;
  text: string;
}

export interface TestFile {
  path: string;
  content: string;
}

export interface TraceReport {
  featureId: string;
  rows: { id: string; text: string; tests: string[] }[];
  uncovered: string[];
  orphans: { id: string; path: string }[];
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
      scenarios.push({ id: `${featureId}-US${story}-AS${item[1]}`, text: item[2] ?? '' });
    }
  }
  return scenarios;
}

export function traceFeature(
  featureId: string,
  scenarios: Scenario[],
  testFiles: TestFile[],
): TraceReport {
  const known = new Set(scenarios.map((scenario) => scenario.id));
  const idPattern = new RegExp(`\\b${featureId}-US\\d+-AS\\d+\\b`, 'g');
  const testsById = new Map<string, Set<string>>();
  const orphans: TraceReport['orphans'] = [];

  for (const file of testFiles) {
    for (const id of new Set(file.content.match(idPattern) ?? [])) {
      if (known.has(id)) {
        testsById.set(id, (testsById.get(id) ?? new Set()).add(file.path));
      } else {
        orphans.push({ id, path: file.path });
      }
    }
  }

  const rows = scenarios.map((scenario) => ({
    id: scenario.id,
    text: scenario.text,
    tests: [...(testsById.get(scenario.id) ?? [])].sort(),
  }));
  const uncovered = rows.filter((row) => row.tests.length === 0).map((row) => row.id);
  orphans.sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path));

  return {
    featureId,
    rows,
    uncovered,
    orphans,
    ok: scenarios.length > 0 && uncovered.length === 0 && orphans.length === 0,
  };
}
