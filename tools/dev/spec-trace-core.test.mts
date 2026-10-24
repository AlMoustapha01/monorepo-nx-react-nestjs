import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  driftedFeatures,
  featureIdOf,
  parseRequirementIndex,
  parseRequirementRefs,
  parseScenarios,
  parseStatus,
  traceFeature,
  traceRequirements,
} from './spec-trace-core.mts';

const SPEC = `# Feature Specification: Order note

**Status**: Implemented

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a note (Priority: P1)

**Acceptance Scenarios**:

1. **Given** an order, **When** the customer saves a note, **Then** the summary shows it.
2. **Given** a note of 501 characters, **When** it is saved, **Then** it is refused.

---

### User Story 2 - Only my orders (Priority: P1)

**Acceptance Scenarios**:

1. **Given** another customer's order, **When** I save a note, **Then** the answer is "not found".

### Edge Cases

1. Two saves at the same time?

## Requirements *(mandatory)*

1. **FR-001**: Not a scenario.
`;

describe('featureIdOf', () => {
  it('reads the number prefix of a feature directory', () => {
    assert.equal(featureIdOf('specs/003-order-note'), '003');
    assert.equal(featureIdOf('/abs/specs/012-x/'), '012');
  });

  it('rejects a directory without a number prefix', () => {
    assert.throws(() => featureIdOf('specs/order-note'), /préfixe numérique/);
  });
});

describe('parseScenarios', () => {
  it('numbers acceptance scenarios by story and position, ignoring edge cases and requirements', () => {
    const scenarios = parseScenarios('003', SPEC);

    assert.deepEqual(
      scenarios.map((scenario) => scenario.id),
      ['003-US1-AS1', '003-US1-AS2', '003-US2-AS1'],
    );
    assert.match(scenarios[1]?.text ?? '', /501 characters/);
    assert.ok(scenarios.every((scenario) => !scenario.retired));
  });

  it('marks a scenario that starts with **Retired** as retired, keeping its number', () => {
    const spec = SPEC.replace(
      '2. **Given** a note of 501',
      '2. **Retired** (replaced by 007-US1-AS1): **Given** a note of 501',
    );
    const retired = parseScenarios('003', spec).find((scenario) => scenario.id === '003-US1-AS2');

    assert.equal(retired?.retired, true);
  });

  it('keeps the number written in the spec, so a removed scenario leaves a gap', () => {
    const spec = SPEC.replace('1. **Given** an order', '3. **Given** an order');

    assert.deepEqual(
      parseScenarios('003', spec).map((scenario) => scenario.id),
      ['003-US1-AS3', '003-US1-AS2', '003-US2-AS1'],
    );
  });
});

describe('parseStatus', () => {
  it('reads the status line of the spec', () => {
    assert.equal(parseStatus(SPEC), 'Implemented');
    assert.equal(parseStatus(SPEC.replace('Implemented', 'Draft')), 'Draft');
  });

  it('rejects a missing or unknown status', () => {
    assert.throws(() => parseStatus(SPEC.replace('**Status**: Implemented', '')), /Status/);
    assert.throws(() => parseStatus(SPEC.replace('Implemented', 'Done')), /Done/);
  });
});

describe('traceFeature', () => {
  const scenarios = parseScenarios('003', SPEC);
  const implemented = { status: 'Implemented' } as const;

  it('maps each scenario to the test files that name it, and lists the uncovered ones', () => {
    const report = traceFeature('003', scenarios, implemented, [
      {
        path: 'libs/api/orders/src/lib/domain/order.spec.ts',
        content: `it('003-US1-AS1: shows the note', () => {});`,
      },
      {
        path: 'apps/api/tests/orders.e2e.spec.ts',
        content: `it("003-US1-AS1: e2e", () => {}); it('003-US2-AS1: 404', () => {});`,
      },
    ]);

    assert.deepEqual(report.rows.find((row) => row.id === '003-US1-AS1')?.tests, [
      'apps/api/tests/orders.e2e.spec.ts',
      'libs/api/orders/src/lib/domain/order.spec.ts',
    ]);
    assert.deepEqual(report.uncovered, ['003-US1-AS2']);
    assert.equal(report.ok, false);
  });

  it('does not count an id that is only a prefix of another one', () => {
    const report = traceFeature('003', scenarios, implemented, [
      { path: 'a.spec.ts', content: `it('003-US1-AS12: other', () => {});` },
    ]);

    assert.deepEqual(report.rows.find((row) => row.id === '003-US1-AS1')?.tests, []);
  });

  it('reports test ids of this feature that match no scenario, and ignores other features', () => {
    const report = traceFeature('003', scenarios, implemented, [
      {
        path: 'a.spec.ts',
        content: `it('003-US1-AS1: ok', () => {}); it('003-US1-AS2: ok', () => {}); it('003-US2-AS1: ok', () => {});`,
      },
      {
        path: 'b.spec.ts',
        content: `it('003-US9-AS1: removed scenario', () => {}); it('004-US1-AS1: other feature', () => {});`,
      },
    ]);

    assert.deepEqual(report.orphans, [{ id: '003-US9-AS1', path: 'b.spec.ts' }]);
    assert.deepEqual(report.uncovered, []);
    assert.equal(report.ok, false);
  });

  it('is ok when every scenario has a test and no test names an unknown scenario', () => {
    const report = traceFeature('003', scenarios, implemented, [
      {
        path: 'a.spec.ts',
        content: `it('003-US1-AS1: a', () => {}); it('003-US1-AS2: b', () => {}); it('003-US2-AS1: c', () => {});`,
      },
    ]);

    assert.equal(report.ok, true);
  });

  it('is not ok when the spec has no acceptance scenario', () => {
    assert.equal(traceFeature('003', [], implemented, []).ok, false);
  });

  it('tolerates uncovered scenarios in a Draft spec, unless strict, but never orphans', () => {
    const draft = traceFeature('003', scenarios, { status: 'Draft' }, [
      { path: 'a.spec.ts', content: `it('003-US1-AS1: a', () => {});` },
    ]);
    assert.deepEqual(draft.uncovered, ['003-US1-AS2', '003-US2-AS1']);
    assert.equal(draft.ok, true);

    const strict = traceFeature('003', scenarios, { status: 'Draft', strict: true }, []);
    assert.equal(strict.ok, false);

    const orphan = traceFeature('003', scenarios, { status: 'Draft' }, [
      { path: 'a.spec.ts', content: `it('003-US9-AS1: gone', () => {});` },
    ]);
    assert.equal(orphan.ok, false);
  });

  it('does not require a test for a retired scenario, and refuses a test that still cites it', () => {
    const withRetired = parseScenarios(
      '003',
      SPEC.replace('2. **Given** a note of 501', '2. **Retired**: **Given** a note of 501'),
    );
    const covered = `it('003-US1-AS1: a', () => {}); it('003-US2-AS1: c', () => {});`;

    const clean = traceFeature('003', withRetired, implemented, [
      { path: 'a.spec.ts', content: covered },
    ]);
    assert.deepEqual(clean.uncovered, []);
    assert.equal(clean.ok, true);

    const stale = traceFeature('003', withRetired, implemented, [
      { path: 'a.spec.ts', content: covered },
      { path: 'b.spec.ts', content: `it('003-US1-AS2: old rule', () => {});` },
    ]);
    assert.deepEqual(stale.retiredCited, [{ id: '003-US1-AS2', path: 'b.spec.ts' }]);
    assert.equal(stale.ok, false);
  });

  it('treats every scenario of a Retired spec as retired', () => {
    const retired = traceFeature('003', scenarios, { status: 'Retired' }, []);
    assert.deepEqual(retired.uncovered, []);
    assert.equal(retired.ok, true);

    const cited = traceFeature('003', scenarios, { status: 'Retired' }, [
      { path: 'a.spec.ts', content: `it('003-US2-AS1: still here', () => {});` },
    ]);
    assert.equal(cited.ok, false);
  });
});

describe('driftedFeatures', () => {
  const diff = `diff --git a/libs/api/orders/src/order.spec.ts b/libs/api/orders/src/order.spec.ts
--- a/libs/api/orders/src/order.spec.ts
+++ b/libs/api/orders/src/order.spec.ts
@@ -10 +10 @@
-  it('003-US1-AS2: refuses a note of 501 characters', () => {
+  it('003-US1-AS2: refuses a note of 1001 characters', () => {
@@ -40,0 +41 @@
+  // 004-US2-AS1 is covered elsewhere
diff --git a/apps/api/tests/old.e2e.spec.ts b/apps/api/tests/old.e2e.spec.ts
deleted file mode 100644
--- a/apps/api/tests/old.e2e.spec.ts
+++ /dev/null
@@ -1 +0,0 @@
-it('005-US1-AS1: gone', () => {});
`;

  it('lists the features whose cited tests changed while their spec.md did not', () => {
    const drift = driftedFeatures(diff, ['specs/004-refunds/spec.md', 'specs/005-x/plan.md']);

    assert.deepEqual(drift, [
      { featureId: '003', paths: ['libs/api/orders/src/order.spec.ts'] },
      { featureId: '005', paths: ['apps/api/tests/old.e2e.spec.ts'] },
    ]);
  });

  it('is empty when every touched feature has its spec.md in the change', () => {
    assert.deepEqual(
      driftedFeatures(diff, [
        'specs/003-order-note/spec.md',
        'specs/004-refunds/spec.md',
        'specs/005-x/spec.md',
      ]),
      [],
    );
  });
});

describe('parseRequirementIndex', () => {
  it('reads the product requirements of the index', () => {
    const index = parseRequirementIndex(
      JSON.stringify({ requirements: [{ id: 'PAY-03', title: 'Pay by mobile money' }] }),
    );

    assert.deepEqual(index, [{ id: 'PAY-03', title: 'Pay by mobile money' }]);
  });

  it('rejects an id that is not <PREFIX>-<number>', () => {
    assert.throws(
      () => parseRequirementIndex(JSON.stringify({ requirements: [{ id: 'pay 3', title: 'x' }] })),
      /pay 3/,
    );
  });

  it('rejects a requirement without a title', () => {
    assert.throws(
      () => parseRequirementIndex(JSON.stringify({ requirements: [{ id: 'PAY-03' }] })),
      /PAY-03/,
    );
  });

  it('rejects a duplicated id', () => {
    const requirements = [
      { id: 'PAY-03', title: 'a' },
      { id: 'PAY-03', title: 'b' },
    ];

    assert.throws(() => parseRequirementIndex(JSON.stringify({ requirements })), /PAY-03/);
  });

  it('rejects a file without a requirements list', () => {
    assert.throws(() => parseRequirementIndex('[]'), /requirements/);
  });
});

describe('parseRequirementRefs', () => {
  it('reads the product requirements a spec implements', () => {
    assert.deepEqual(
      parseRequirementRefs('**Status**: Draft\n\n**Product Requirements**: PAY-03, PAY-04\n'),
      ['PAY-03', 'PAY-04'],
    );
  });

  it('reads None as no requirement', () => {
    assert.deepEqual(parseRequirementRefs('**Product Requirements**: None\n'), []);
  });

  it('ignores a trailing comma', () => {
    assert.deepEqual(parseRequirementRefs('**Product Requirements**: PAY-03,\n'), ['PAY-03']);
  });

  it('tells a missing line apart from None', () => {
    assert.equal(parseRequirementRefs(SPEC), undefined);
  });
});

describe('traceRequirements', () => {
  const index = [
    { id: 'PAY-03', title: 'Pay by mobile money' },
    { id: 'PAY-04', title: 'Refund' },
    { id: 'ORD-01', title: 'Order note' },
  ];

  it('maps each requirement to its specs, and its state to the least advanced active spec', () => {
    const report = traceRequirements(index, [
      { featureDir: 'specs/003-pay', status: 'Shipped', refs: ['PAY-03'] },
      { featureDir: 'specs/007-pay-v2', status: 'Draft', refs: ['PAY-03', 'ORD-01'] },
      { featureDir: 'specs/002-note', status: 'Retired', refs: ['ORD-01'] },
    ]);

    assert.deepEqual(
      report.rows.map((row) => [row.id, row.state, row.specs.map((spec) => spec.featureDir)]),
      [
        ['PAY-03', 'Draft', ['specs/003-pay', 'specs/007-pay-v2']],
        ['PAY-04', 'Unspecified', []],
        ['ORD-01', 'Draft', ['specs/002-note', 'specs/007-pay-v2']],
      ],
    );
    assert.equal(report.ok, true);
  });

  it('marks a requirement whose specs are all retired as retired', () => {
    const report = traceRequirements(index, [
      { featureDir: 'specs/002-note', status: 'Retired', refs: ['ORD-01'] },
    ]);

    assert.equal(report.rows.find((row) => row.id === 'ORD-01')?.state, 'Retired');
  });

  it('fails when a spec cites a requirement absent from the index', () => {
    const report = traceRequirements(index, [
      { featureDir: 'specs/003-pay', status: 'Draft', refs: ['PAY-99'] },
    ]);

    assert.deepEqual(report.unknown, [{ featureDir: 'specs/003-pay', id: 'PAY-99' }]);
    assert.equal(report.ok, false);
  });

  it('fails when a spec has no Product Requirements line, so that none is forgotten', () => {
    const report = traceRequirements(index, [
      { featureDir: 'specs/003-pay', status: 'Draft', refs: undefined },
    ]);

    assert.deepEqual(report.missingLine, ['specs/003-pay']);
    assert.equal(report.ok, false);
  });

  it('does not require the line in a retired spec, written before the index existed', () => {
    const report = traceRequirements(index, [
      { featureDir: 'specs/002-note', status: 'Retired', refs: undefined },
    ]);

    assert.deepEqual(report.missingLine, []);
    assert.equal(report.ok, true);
  });

  it('without an index, accepts specs without the line but not specs that cite a requirement', () => {
    const report = traceRequirements(undefined, [
      { featureDir: 'specs/002-note', status: 'Draft', refs: undefined },
      { featureDir: 'specs/003-pay', status: 'Draft', refs: ['PAY-03'] },
    ]);

    assert.deepEqual(report.rows, []);
    assert.deepEqual(report.missingLine, []);
    assert.deepEqual(report.unknown, [{ featureDir: 'specs/003-pay', id: 'PAY-03' }]);
    assert.equal(report.ok, false);
  });
});
