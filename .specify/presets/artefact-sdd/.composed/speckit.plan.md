---
description: Execute the implementation planning workflow using the plan template
  to generate design artifacts.
handoffs:
- label: Create Tasks
  agent: speckit.tasks
  prompt: Break the plan into tasks
  send: true
- label: Create Checklist
  agent: speckit.checklist
  prompt: Create a checklist for the following domain...
scripts:
  sh: scripts/bash/setup-plan.sh --json
  ps: scripts/powershell/setup-plan.ps1 -Json
  py: scripts/python/setup_plan.py --json
---


## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before planning)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. **Setup**: Run `{SCRIPT}` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, FEATURE_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `/memory/constitution.md`. Load IMPL_PLAN template (already copied).

3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Re-evaluate Constitution Check post-design

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.
- If it does not exist, or no hooks are registered under `hooks.after_plan`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_plan` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue to the Completion Report.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Mandatory hook** (`optional: false`) — **You MUST emit `EXECUTE_COMMAND:` for each mandatory hook**:
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Completion Report

Command ends after Phase 1 design. Report branch, IMPL_PLAN path, and generated artifacts.

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Define interface contracts** (if project has external interfaces) → `/contracts/`:
   - Identify what interfaces the project exposes to users or other systems
   - Document the contract format appropriate for the project type
   - Examples: public APIs for libraries, command schemas for CLI tools, endpoints for web services, grammars for parsers, UI contracts for applications
   - Skip if project is purely internal (build scripts, one-off tools, etc.)

3. **Create quickstart validation guide** → `quickstart.md`:
   - Document runnable validation scenarios that prove the feature works end-to-end
   - Include prerequisites, setup commands, test/run commands, and expected outcomes
   - Use links or references to contracts and data model details instead of duplicating them
   - Do not include full implementation code, model/service/controller bodies, migrations, or complete test suites
   - Keep this artifact as a validation/run guide; implementation details belong in `tasks.md` and the implementation phase

**Output**: data-model.md, /contracts/*, quickstart.md

## Key rules

- Use absolute paths for filesystem operations; use project-relative paths for references in documentation
- ERROR on gate failures or unresolved clarifications

## Done When

- [ ] Plan workflow executed and design artifacts generated
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Completion reported to user with branch, plan path, and generated artifacts


<!-- artefact-sdd preset (source: preset/ of speckit-artefact). Appended to the core command. -->

## Project Stack (artefact-sdd)

Read `.specify/stack.yml` first: it names this project's branches, commands, test files and convention files. `commands.test` and `commands.affected` are required: when one is missing, or the file itself, stop and ask the user to write it. Any other key that is absent or `null` skips the step that uses it: say so in the report, never invent a command. An absent key never removes a test: tests always run, with what `tests.needs` lists.

## Language (artefact-sdd)

Write the artifacts in the project language: `language` in `.specify/memory/language.yml`, a BCP 47 code (`fr`); English when the file does not exist. What stays as the template or the tools write it, in every language: the headings of the templates (`## Requirements`, `### User Story 1 - …`, `## Complexity Tracking`: commands and reviewers find sections by them), the markers that the trace command reads (`**Status**:` and its values `Draft`, `Implemented`, `Shipped`, `Retired`; `**Product Requirements**:`; `**Acceptance Scenarios**`; `**Retired**`), the `[NEEDS CLARIFICATION]` markers that commands look for, the task lines (`- [ ] T001 [P] [US1] …`), the ids (`003-US1-AS2`, `PAY-03`, `E03-J1`, `P1`) and the YAML keys of `specs/product.yml`. Commit messages, code, identifiers and test titles stay in English. A file still written in another language: write what you add or rewrite in the project language, and leave the rest as it is.

## Decisions for the User (artefact-sdd)

These rules take precedence over any instruction above that contradicts them. The plan is the agent's proposal; some choices are the user's.

- **Stop and ask** before designing on top of a choice that:
  - deviates from a principle of the constitution or from a convention of the files listed under `docs` in `.specify/stack.yml` (an unchecked box of the Constitution Check);
  - changes a path listed in `.github/CODEOWNERS`, when the repository has one, beyond what the feature obviously needs;
  - adds an infrastructure dependency (a database, a queue, a service the app calls, a cloud SDK, a container image);
  - picks between designs that will be hard to change later (how shared data is partitioned, a new role, where files are stored).

  List each one in **Decisions for the User** of the plan: the question, the options with what each one costs, and your recommendation. Show them to the user and end your turn there: the rest of the command, and its `after_plan` commit hook, run only once every decision has an answer. Then record each answer and its reason in that section, and go on.

- Everything else you settle yourself, in `research.md`, and say so in the report.

## Research (artefact-sdd)

- Resolve the unknowns from the repo first: the convention files listed under `docs` in `.specify/stack.yml` (they prevail over the plan template wherever the two differ), the architecture notes and decision records of the repository, and the existing code. Launching research agents is optional; do it only when it saves reading many files.
- When those docs give rules for the plan (code to remove before the first feature, names already taken, a layout to follow), apply them; a conflict between them and the feature is a decision for the user.

## Test Strategy (artefact-sdd)

- A scenario that needs a later story (a story 2 scenario about products that arrive in story 3) is cited by the test of the story that completes it. The earlier story may test the part it delivers, without the scenario id; say so in the Test Strategy.

## Prototype (artefact-sdd)

When `ui` is set in `.specify/stack.yml` and `specs/prototype/journeys/NNN-<name>.md` exists (written by `/speckit-prototype`), the plan builds on it; otherwise nothing changes and nothing blocks.

- Read `specs/prototype/journeys/NNN-<name>.md` and, when there is a mockup, look at the captures of its screens in `specs/prototype/captures/` (a prototype may have journeys only). In the plan, cite next to each screen to build the captures that fix it, when they exist (`specs/prototype/captures/cart-desktop.png`, `cart-mobile.png`): they are the visual contract of `/speckit-implement`.
- The components drawn in the mockup that the component library (`ui.components`) lacks, listed in `specs/prototype/journeys/NNN-<name>.md`, are added to that library by the plan, test first and, when `ui.storybook` is true, with their Storybook story, before the screens that use them.
- When the captures are older than the design direction (`git log -1 --format=%cI -- 'specs/prototype/captures/cart-*.png'`, for the screens of the feature, before `git log -1 --format=%cI -- specs/design.md`), write it in the plan and tell the user: the theme changed since, and `/speckit-prototype` can refresh them.
