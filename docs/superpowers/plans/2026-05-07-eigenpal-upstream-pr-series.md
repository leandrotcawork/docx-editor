# EigenPal Upstream PR Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the current EigenPal upstream header/footer behavior and prepare the first small upstream PR only for still-reproducible DOCX header table fidelity issues.

**Architecture:** Work from current `origin/main`, not from the historical Metal Docs fork patch. First create evidence and a triage report, then choose the smallest PR 1 scope, then port only the code required for that scope. Keep visual render fidelity, inline editor table UX, template variables, body pagination, and round-trip formatting as separate PR surfaces.

**Tech Stack:** Git, Bun, Vite, EigenPal `packages/core`, EigenPal `packages/react`, browser validation through the in-app browser, DOCX/PDF reference fixtures.

---

## Context

Read these files before executing:

- `docs/metaldocs/upstream-pr-series-design.md`
- `docs/metaldocs/maintainer-change-summary.md`
- `docs/metaldocs/header-footer-table-lab-dossier.md`
- `docs/metaldocs/pr-splitting-plan.md`

Current facts:

- Upstream `origin/main` includes `@eigenpal/docx-js-editor@0.4.3`.
- Upstream already includes header/footer changes after `0.4.2`, especially commit `11abc2d fix(hf): four follow-ups to header/footer unification`.
- The historical Metal Docs patch tag is `metaldocs-eigenpal-v0.2.0`.
- Do not send the entire fork patch upstream.
- Do not include `docs/metaldocs/*` in upstream PRs unless Jedr explicitly asks for those docs.

## File Structure

Create or modify only these planning/evidence files until Task 6:

- Create: `docs/metaldocs/validation/2026-05-07-current-upstream-header-table-triage.md`
- Create: `docs/metaldocs/validation/screenshots/`
- Optional copied references:
  - `docs/metaldocs/validation/fixtures/`
  - Store only files we are allowed to share publicly.

Expected implementation files for PR 1 are not selected until Task 5. Candidate areas:

- `packages/core/src/layout-bridge/headerFooterLayout.ts`
- `packages/core/src/layout-bridge/measuring/measureParagraph.ts`
- `packages/core/src/layout-painter/renderPage.ts`
- `packages/core/src/layout-painter/renderTable.ts`
- `packages/react/src/paged-editor/PagedEditor.tsx`

Historical fork source areas for comparison only:

- `packages/core/src/layout-bridge/measureHeaderFooter.ts`
- `packages/react/src/paged-editor/headerFooterContent.ts`
- `packages/core/src/layout-painter/renderPage.ts`
- `packages/core/src/layout-painter/renderTable.ts`

## Task 1: Prepare Clean Upstream Validation Branch

**Files:**
- No file edits expected.

- [ ] **Step 1: Fetch latest upstream and fork refs**

Run:

```powershell
git fetch origin main --tags
git fetch fork main --tags
```

Expected:

```text
origin/main fetched successfully
fork/main fetched successfully
```

- [ ] **Step 2: Create validation branch from current upstream**

Run:

```powershell
git switch -C leandro/hf-table-current-upstream-validation origin/main
```

Expected:

```text
Switched to a new branch 'leandro/hf-table-current-upstream-validation'
```

If the branch already exists locally, the `-C` reset is acceptable only before implementation begins. Do not use `-C` after any uncommitted validation work exists.

- [ ] **Step 3: Confirm branch base**

Run:

```powershell
git log --oneline --decorate -n 5
git status --short --branch
```

Expected:

```text
HEAD is at origin/main or the current upstream release commit
Working tree has no modified tracked files
```

- [ ] **Step 4: Record upstream version**

Run:

```powershell
git tag --points-at HEAD
Get-Content packages\react\package.json | Select-String '"version"'
```

Expected:

```text
The package version is current upstream, currently 0.4.3 or newer
```

## Task 2: Prepare Shareable Fixture And Evidence Folder

**Files:**
- Create: `docs/metaldocs/validation/`
- Create: `docs/metaldocs/validation/screenshots/`
- Create: `docs/metaldocs/validation/fixtures/`
- Create: `docs/metaldocs/validation/2026-05-07-current-upstream-header-table-triage.md`

- [ ] **Step 1: Create validation folders**

Run:

```powershell
New-Item -ItemType Directory -Force docs\metaldocs\validation | Out-Null
New-Item -ItemType Directory -Force docs\metaldocs\validation\screenshots | Out-Null
New-Item -ItemType Directory -Force docs\metaldocs\validation\fixtures | Out-Null
```

Expected:

```text
Directories exist
```

- [ ] **Step 2: Locate the real DOCX/PDF references**

Check likely local paths:

```powershell
Test-Path "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Downloads\DC_Template_Descricao_Cargo.docx"
Test-Path "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Downloads\DC_Template_Descricao_Cargo.pdf"
Test-Path "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Downloads\DC_Template_Descricao_Cargo_Border.pdf"
```

Expected:

```text
At least the DOCX and one Word-exported PDF reference are available
```

- [ ] **Step 3: Copy only shareable fixtures into validation folder**

Run only after confirming the user is comfortable sharing the template publicly:

```powershell
Copy-Item "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Downloads\DC_Template_Descricao_Cargo.docx" docs\metaldocs\validation\fixtures\dc-template-descricao-cargo.docx
Copy-Item "C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Downloads\DC_Template_Descricao_Cargo.pdf" docs\metaldocs\validation\fixtures\dc-template-descricao-cargo-word.pdf
```

Expected:

```text
Fixture files exist under docs/metaldocs/validation/fixtures
```

If the real template is not safe for public PRs, skip copying it and create a synthetic fixture in a later task.

- [ ] **Step 4: Create triage note skeleton**

Create `docs/metaldocs/validation/2026-05-07-current-upstream-header-table-triage.md` with:

```markdown
# Current Upstream Header Table Triage

Date: 2026-05-07
Base: `origin/main`
Reference release: `@eigenpal/docx-js-editor@0.4.3`

## Fixture

- DOCX:
- Word/PDF reference:
- Notes about public sharing:

## Expected Header

- Screenshot:
- Description:

## Upstream Normal Render

- Screenshot:
- Observations:

## Upstream Header Edit Mode

- Screenshot:
- Observations:

## Still Broken

- [ ] Header table image/logo clipping:
- [ ] Header table row height/gap:
- [ ] Separator/bordered paragraph position:
- [ ] Right-cell paragraph rhythm:
- [ ] Render mode vs edit mode parity:
- [ ] Header editor table interaction:
- [ ] Page field formatting:
- [ ] Header/footer variable detection:

## Fixed Upstream

- [ ] Header table is visible in normal render:

## Not Part Of PR 1

- Body pagination:
- General table width commands:
- DOCX/ProseMirror round-trip formatting:

## PR 1 Recommendation

- Proposed scope:
- Proposed files:
- Proposed tests:
```

Expected:

```text
Triage skeleton committed only after screenshots/observations are filled
```

## Task 3: Run Current Upstream Editor Locally

**Files:**
- No source edits expected.

- [ ] **Step 1: Install dependencies if needed**

Run:

```powershell
bun install
```

Expected:

```text
Dependencies install without modifying source code unexpectedly
```

If `bun` is unavailable, use the repository's documented install command from `docs/` or `package.json`.

- [ ] **Step 2: Start Vite/editor demo**

Run the repository's documented dev command. Prefer:

```powershell
bun run dev
```

Expected:

```text
Local dev server starts and prints a localhost or 127.0.0.1 URL
```

If the repo uses package-specific dev scripts, inspect `package.json` and use the existing script instead of inventing a new one.

- [ ] **Step 3: Open the app with Browser Use**

Use the Browser Use plugin to open the local URL.

Expected:

```text
The current upstream editor demo loads in the in-app browser
```

- [ ] **Step 4: Load the DOCX fixture**

Use the UI's normal import/open flow to load the real DOCX or synthetic header-table fixture.

Expected:

```text
The document appears in the editor and the header table is visible in normal render
```

If no UI fixture loader exists on current upstream, add a temporary local-only validation route on the validation branch and do not include it in upstream PRs.

## Task 4: Capture Expected vs Actual Evidence

**Files:**
- Modify: `docs/metaldocs/validation/2026-05-07-current-upstream-header-table-triage.md`
- Add screenshots under: `docs/metaldocs/validation/screenshots/`

- [ ] **Step 1: Capture Word/PDF expected header**

Use either the existing PDF or a screenshot from Word.

Save as:

```text
docs/metaldocs/validation/screenshots/expected-word-header.png
```

Expected:

```text
Screenshot shows the expected header table, logo/image, right-cell text, and separator line
```

- [ ] **Step 2: Capture upstream normal render**

Use Browser Use screenshot after loading the DOCX.

Save as:

```text
docs/metaldocs/validation/screenshots/upstream-normal-render-header.png
```

Expected:

```text
Screenshot shows current upstream normal paginated header render
```

- [ ] **Step 3: Capture upstream header edit mode**

Double-click the header in the browser and capture:

```text
docs/metaldocs/validation/screenshots/upstream-header-edit-mode.png
```

Expected:

```text
Screenshot shows current upstream inline header editor behavior
```

- [ ] **Step 4: Fill the triage note**

Update `docs/metaldocs/validation/2026-05-07-current-upstream-header-table-triage.md` with concrete observations.

Use this wording style:

```markdown
## Still Broken

- [x] Header table image/logo clipping: The logo top/bottom is clipped in normal render compared with Word/PDF.
- [x] Header table row height/gap: Normal render row height is smaller than Word/PDF and edit mode.
- [x] Separator/bordered paragraph position: The red separator line is shifted upward by visual inspection.
- [ ] Page field formatting: Not tested in this fixture.
```

Expected:

```text
The note identifies what remains broken and what is fixed upstream
```

## Task 5: Decide PR 1 Scope

**Files:**
- Modify: `docs/metaldocs/validation/2026-05-07-current-upstream-header-table-triage.md`

- [ ] **Step 1: Compare triage against PR 1 scope**

Read:

```text
docs/metaldocs/upstream-pr-series-design.md
```

Expected:

```text
PR 1 includes only normal header/footer table render fidelity issues
```

- [ ] **Step 2: Write the PR 1 recommendation section**

Fill:

```markdown
## PR 1 Recommendation

- Proposed scope:
  - Header table row height in normal render.
  - Logo/image clipping in header table cell.
  - Separator/bordered paragraph vertical position.
- Proposed out of scope:
  - Header table CellSelection.
  - Header editor context menu.
  - Body pagination.
  - Variable detection.
- Proposed files:
  - `packages/core/src/layout-bridge/headerFooterLayout.ts`
  - `packages/core/src/layout-painter/renderPage.ts`
  - `packages/core/src/layout-painter/renderTable.ts`
- Proposed tests:
  - Header/footer table measurement test.
  - Header/footer render regression test or screenshot/manual validation.
```

Expected:

```text
The recommendation is narrow enough to become a first upstream PR
```

- [ ] **Step 3: Stop for human review**

Ask the user to review the triage note and screenshots before code porting starts.

Expected:

```text
User approves PR 1 scope
```

## Task 6: Prepare PR 1 Branch

**Files:**
- No source edits until PR 1 scope is approved.

- [ ] **Step 1: Create PR 1 branch from origin/main**

Run:

```powershell
git switch -C leandro/hf-table-render-fidelity origin/main
```

Expected:

```text
Branch is based on current origin/main
```

- [ ] **Step 2: Copy only approved evidence docs if useful**

If evidence docs should live in the fork branch but not upstream PR, keep them only on `fork/main`.

For upstream PR branch, do not add `docs/metaldocs/*` unless Jedr asks for docs in the PR.

Expected:

```text
PR branch contains only source/test/fixture changes intended for upstream
```

## Task 7: Write The First Failing Test

**Files:**
- Test file to be selected after inspecting current upstream architecture.
- Candidate files:
  - `packages/core/src/layout-bridge/__tests__/normalizeHeaderFooterMeasureBlocks.test.ts`
  - `packages/core/src/layout-painter/__tests__/floating-table-hf-position.test.ts`
  - A new focused test near upstream's current header/footer layout tests.

- [ ] **Step 1: Inspect current upstream header/footer tests**

Run:

```powershell
Get-ChildItem packages\core\src\layout-bridge\__tests__ -File
Get-ChildItem packages\core\src\layout-painter\__tests__ -File
```

Expected:

```text
Choose the existing test file closest to the still-broken behavior
```

- [ ] **Step 2: Add a failing test for the approved PR 1 bug**

Example test shape for row-height/image clipping:

```ts
it('reserves header table row height for image and text sibling cells', () => {
  // Build the smallest header/footer table block that reproduces the measured gap.
  // Assert the row/header measurement is at least the Word-like max cell requirement.
});
```

Expected:

```text
The test fails on origin/main before implementation
```

- [ ] **Step 3: Run the focused test**

Run the exact command for the selected test file, for example:

```powershell
bun test packages/core/src/layout-bridge/__tests__/normalizeHeaderFooterMeasureBlocks.test.ts
```

Expected:

```text
New test fails for the expected reason
```

## Task 8: Port Minimal PR 1 Implementation

**Files:**
- Exact files depend on Task 5/7 outcome.
- Candidate files:
  - `packages/core/src/layout-bridge/headerFooterLayout.ts`
  - `packages/core/src/layout-bridge/measuring/measureParagraph.ts`
  - `packages/core/src/layout-painter/renderPage.ts`
  - `packages/core/src/layout-painter/renderTable.ts`

- [ ] **Step 1: Compare upstream implementation to fork patch**

Use:

```powershell
git diff origin/main..metaldocs-eigenpal-v0.2.0 -- packages/core/src/layout-painter/renderPage.ts packages/core/src/layout-painter/renderTable.ts
```

Expected:

```text
Identify only the minimal logic needed for the failing PR 1 test
```

- [ ] **Step 2: Implement the smallest upstream-compatible fix**

Do not copy old fork modules wholesale. Adapt to current upstream's `headerFooterLayout.ts` and related helpers.

Expected:

```text
Only the approved PR 1 behavior changes
```

- [ ] **Step 3: Run focused test**

Run:

```powershell
bun test <selected-test-file>
```

Expected:

```text
Focused test passes
```

- [ ] **Step 4: Run related header/footer tests**

Run:

```powershell
bun test packages/core/src/layout-bridge/__tests__/normalizeHeaderFooterMeasureBlocks.test.ts packages/core/src/layout-painter/__tests__/floating-table-hf-position.test.ts packages/core/src/layout-painter/__tests__/positioning-context.test.ts
```

Expected:

```text
Related tests pass
```

## Task 9: Browser Validate PR 1

**Files:**
- Update PR evidence note only if useful for our fork docs.

- [ ] **Step 1: Restart dev server on PR 1 branch**

Run the same dev command used in Task 3.

Expected:

```text
Local app runs with PR 1 code
```

- [ ] **Step 2: Reload DOCX in browser**

Use Browser Use to open the same fixture.

Expected:

```text
Document loads without console errors related to the PR
```

- [ ] **Step 3: Capture fixed screenshot**

Save:

```text
docs/metaldocs/validation/screenshots/pr1-fixed-normal-render-header.png
```

Expected:

```text
Screenshot demonstrates the PR 1 gap improved versus upstream actual
```

- [ ] **Step 4: Compare against expected**

Update the triage note with:

```markdown
## PR 1 Validation

- Expected screenshot:
- Upstream actual screenshot:
- PR 1 fixed screenshot:
- Remaining differences:
```

Expected:

```text
The visual evidence is ready for the upstream PR body
```

## Task 10: Prepare PR 1 For Upstream

**Files:**
- Source/test files from Task 8.
- Do not include `docs/metaldocs/*` in upstream PR unless maintainer asks.

- [ ] **Step 1: Run package checks**

Run:

```powershell
bun test <focused-test-file>
bun test <related-header-footer-test-files>
bun run --filter @eigenpal/docx-core typecheck
bun run --filter @eigenpal/docx-js-editor typecheck
```

Expected:

```text
Modified package tests and typechecks pass
```

- [ ] **Step 2: Commit PR 1**

Run:

```powershell
git status --short
git add <source-and-test-files-only>
git commit -m "fix(hf): improve header/footer table render fidelity"
```

Expected:

```text
Commit contains only PR 1 source/test files
```

- [ ] **Step 3: Push PR 1 branch**

Run:

```powershell
git push fork leandro/hf-table-render-fidelity
```

Expected:

```text
Branch exists on GitHub fork
```

- [ ] **Step 4: Draft PR body**

Use this template:

```markdown
## Summary

- Improve header/footer table render fidelity for DOCX headers that combine table cells, images, text, and separator paragraphs.
- Add focused coverage for the measured/rendered case.

## Why

Recent header/footer changes make the table visible, but this fixture still differs from Word/PDF in normal render mode. The remaining gap is table measurement/painting fidelity, not basic table presence.

## Expected vs Actual

- Expected: <attach Word/PDF screenshot>
- Actual on current main: <attach upstream screenshot>
- Fixed in this PR: <attach PR screenshot>

## Scope

Included:
- Header/footer table render measurement/painting for the reproduced case.

Excluded:
- Inline header table selection/commands.
- Body pagination.
- Template variable discovery.
- Round-trip formatting.

## Test Plan

- `bun test <focused-test-file>`
- `bun test <related-header-footer-test-files>`
- Browser validation with attached DOCX/PDF fixture.
```

Expected:

```text
PR is ready to open on eigenpal/docx-editor
```

## Task 11: Decide Next PR

**Files:**
- Update `docs/metaldocs/validation/2026-05-07-current-upstream-header-table-triage.md`.

- [ ] **Step 1: Re-read remaining `Still Broken` list**

Expected:

```text
The next PR is selected by actual remaining failures, not by historical fork order
```

- [ ] **Step 2: Choose next PR**

Use this order:

1. Inline header/footer table editing parity.
2. Header/footer variables/page fields.
3. General table width/command semantics.
4. Body layout border/pagination fidelity.
5. DOCX/ProseMirror formatting round-trip.

Expected:

```text
Only one next PR is selected
```

- [ ] **Step 3: Write a short follow-up plan**

Create a new plan only for the next PR.

Expected:

```text
No broad multi-area implementation starts without a new focused plan
```

