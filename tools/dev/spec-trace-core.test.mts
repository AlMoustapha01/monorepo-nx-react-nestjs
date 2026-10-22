import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { featureIdOf, parseScenarios, traceFeature } from './spec-trace-core.mts';

const SPEC = `# Feature Specification: Order note

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
  });

  it('keeps the number written in the spec, so a removed scenario leaves a gap', () => {
    const spec = SPEC.replace('1. **Given** an order', '3. **Given** an order');

    assert.deepEqual(
      parseScenarios('003', spec).map((scenario) => scenario.id),
      ['003-US1-AS3', '003-US1-AS2', '003-US2-AS1'],
    );
  });
});

describe('traceFeature', () => {
  const scenarios = parseScenarios('003', SPEC);

  it('maps each scenario to the test files that name it, and lists the uncovered ones', () => {
    const report = traceFeature('003', scenarios, [
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
    const report = traceFeature('003', scenarios, [
      { path: 'a.spec.ts', content: `it('003-US1-AS12: other', () => {});` },
    ]);

    assert.deepEqual(report.rows.find((row) => row.id === '003-US1-AS1')?.tests, []);
  });

  it('reports test ids of this feature that match no scenario, and ignores other features', () => {
    const report = traceFeature('003', scenarios, [
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
    const report = traceFeature('003', scenarios, [
      {
        path: 'a.spec.ts',
        content: `it('003-US1-AS1: a', () => {}); it('003-US1-AS2: b', () => {}); it('003-US2-AS1: c', () => {});`,
      },
    ]);

    assert.equal(report.ok, true);
  });

  it('is not ok when the spec has no acceptance scenario', () => {
    assert.equal(traceFeature('003', [], []).ok, false);
  });
});
