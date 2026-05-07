# Upstream PR Series Design

Status: approved design
Date: 2026-05-07
Target upstream base: `origin/main`
Reference upstream release: `@eigenpal/docx-js-editor@0.4.3`
Internal reference tag: `metaldocs-eigenpal-v0.2.0`

## Purpose

EigenPal maintainers asked for a PR and screenshots showing expected versus actual header behavior. Since upstream already shipped header/footer improvements in `0.4.2` and `0.4.3`, the fork changes must not be sent as one large historical patch.

This design defines how to turn the Metal Docs EigenPal fork work into small upstream-friendly PRs. The first step is validation against current `origin/main`, then only still-reproducible gaps should become PRs.

## Source References

- `docs/metaldocs/maintainer-change-summary.md` explains the full fork patch and the bug family.
- `docs/metaldocs/header-footer-table-lab-dossier.md` is the chronological investigation log.
- `docs/metaldocs/pr-splitting-plan.md` is the earlier broad split plan.
- `metaldocs-eigenpal-v0.2.0` marks the internal patch checkpoint.

## Guiding Principles

- Base every upstream PR on current `origin/main`.
- Do not send `docs/metaldocs/*` as upstream documentation unless maintainers explicitly ask for it.
- Do not port code just because it exists in the fork; port only behavior that still fails on current upstream.
- Keep each PR focused on one reviewable behavioral surface.
- Each PR needs a reproduction, expected/actual screenshots, a concise cause explanation, and focused tests.
- Prefer a minimal fixture when possible, but keep the real DOCX/PDF available as evidence for the maintainer.

## Phase 1: Current Upstream Validation

Goal: decide what still matters after upstream `0.4.2` and `0.4.3`.

Steps:

1. Create a clean validation branch from `origin/main`.
2. Run the current upstream editor locally.
3. Load the real DOCX template with a table in the header.
4. Compare three views:
   - Word/PDF expected output.
   - Upstream normal paginated render.
   - Upstream inline header edit mode.
5. Capture screenshots for maintainer review.
6. Produce a triage note with:
   - `Still broken`
   - `Fixed upstream`
   - `Not part of PR 1`

Exit criteria:

- We know exactly which header/footer table bugs still reproduce on `origin/main`.
- We have screenshots that show the gap Jedr requested.
- We can scope PR 1 without including unrelated fork changes.

## PR 1: Header/Footer Table Render Fidelity

Recommended first PR.

Scope:

- Header/footer table visual fidelity in normal paginated render mode.
- Row height and content height for header/footer tables.
- Logo/image clipping inside header table cells.
- Separator line or bordered paragraph position under the header table.
- Paragraph spacing/rhythm inside header table cells when it affects Word/PDF parity.
- Render mode versus Word/PDF comparison.

Out of scope:

- Cell selection and table command UX inside the inline header editor.
- Body pagination and section 09 alignment.
- Template variable discovery.
- General DOCX/ProseMirror round-trip formatting.
- Broad table command semantics unless directly required for render fidelity.

Likely fork source areas:

- `packages/core/src/layout-bridge/measureHeaderFooter.ts`
- `packages/core/src/layout-painter/renderPage.ts`
- `packages/core/src/layout-painter/renderTable.ts`
- `packages/react/src/paged-editor/PagedEditor.tsx`
- `packages/react/src/paged-editor/headerFooterContent.ts`

Important upstream caveat:

Current upstream already has `packages/core/src/layout-bridge/headerFooterLayout.ts` and header/footer follow-up fixes. PR 1 must adapt to upstream's current architecture instead of blindly reintroducing the fork's older modules.

Validation:

- Focused unit tests for header/footer table measurement/rendering.
- Browser screenshot comparison using the real DOCX/PDF.
- PR body includes expected versus actual screenshots.

## PR 2: Inline Header/Footer Table Editing Parity

Open only if Phase 1 confirms this is still broken after PR 1 or current upstream.

Scope:

- Header/footer table cell selection.
- Divider hover and resize affordances.
- Context menu table command behavior.
- Single-row `deleteRow` behavior.
- Editor mode versus static render parity after entering/leaving header editing.

Out of scope:

- Static render row-height fixes already covered by PR 1.
- Body table behavior unless needed as a regression reference.

Likely fork source areas:

- `packages/react/src/components/InlineHeaderFooterEditor.tsx`
- `packages/react/src/styles/editor.css`
- `packages/core/src/prosemirror/extensions/nodes/TableExtension.ts`

Validation:

- Focused interaction tests where practical.
- Browser/manual validation comparing header table behavior with body table behavior.

## PR 3: Header/Footer Template Variables And Page Fields

Open only if still reproducible on current upstream.

Scope:

- Template variables inside referenced header/footer package parts.
- Avoid scanning unreferenced header/footer parts.
- Page field or total-page field formatting if it still loses visible formatting in header/footer render/edit transitions.
- Overlay alignment only when tied to actual visible placeholder tags.

Out of scope:

- General template plugin redesign.
- Body-only placeholder behavior.

Likely fork source areas:

- `packages/core/src/utils/variableDetector.ts`
- `packages/react/src/plugins/template/components/TemplateHighlightOverlay.tsx`
- Round-trip field formatting tests if the issue reproduces.

Validation:

- Synthetic DOCX fixture with variables in referenced header/footer parts.
- Focused detector/overlay tests.

## PR 4: General Table Width And Command Semantics

Open only if still relevant after PR 1/2.

Scope:

- Fixed-width table resize preservation.
- Percentage table add/delete column totals.
- Nested table width behavior when parent cell width is known.

Out of scope:

- Header visual render fidelity already covered by PR 1.
- Inline header editor selection behavior already covered by PR 2.

Likely fork source areas:

- `packages/core/src/prosemirror/extensions/nodes/TableExtension.ts`

Validation:

- ProseMirror table command tests.
- Body table regression checks.
- Header table regression checks only if the behavior affects header editing.

## PR 5: Body Layout Border And Pagination Fidelity

Open only if maintainers want the broader Word/PDF body fidelity fixes.

Scope:

- Paragraph spacing fit decisions.
- Grouped paragraph borders.
- Table border measurement parity between layout and painter.
- Table continuation rows.

Out of scope:

- Header/footer bugs.
- Template variables.

Likely fork source areas:

- `packages/core/src/layout-engine/borders.ts`
- `packages/core/src/layout-engine/index.ts`
- `packages/core/src/layout-engine/paginator.ts`
- `packages/core/src/layout-painter/renderParagraph.ts`
- `packages/core/src/layout-painter/renderTable.ts`

Validation:

- Focused layout-engine and painter tests.
- Word/PDF page anchor comparison if the real template remains useful.

## PR 6: DOCX/ProseMirror Formatting Round-Trip

Open only as a separate conversion/serialization PR.

Scope:

- Avoid serializing style-resolved formatting as direct formatting.
- Preserve intentional user deltas.
- Stable structural formatting comparison.
- Width round-trip tolerance.

Out of scope:

- Header/footer rendering.
- Table editing UX.

Likely fork source areas:

- `packages/core/src/prosemirror/conversion/toProseDoc.ts`
- `packages/core/src/prosemirror/conversion/fromProseDoc.ts`
- `packages/core/src/prosemirror/extensions/core/ParagraphExtension.ts`
- `packages/core/src/prosemirror/schema/nodes.ts`

Validation:

- Focused DOCX/ProseMirror conversion tests.
- Round-trip tests that prove unchanged inherited formatting does not become direct formatting.

## PR Body Template

Each PR should use this shape:

```markdown
## Summary

- <behavior fixed>
- <test/fixture added>

## Why

<Explain the current upstream behavior and why it differs from Word/PDF or editor/body parity.>

## Expected vs Actual

- Expected: <screenshot or description from Word/PDF>
- Actual: <screenshot from upstream main>

## Scope

Included:
- <specific included behavior>

Excluded:
- <explicit follow-up areas>

## Test Plan

- <focused unit tests>
- <browser/manual validation>
```

## Acceptance Criteria For Starting Implementation

Implementation should not start until:

- The real DOCX and Word/PDF expected screenshots are available.
- Current `origin/main` has been validated enough to know what still fails.
- PR 1 has a narrow still-reproducible behavior.
- The branch name and PR title are chosen for PR 1.

## Recommended First Branch

Branch:

```text
leandro/hf-table-render-fidelity
```

PR title:

```text
fix(hf): improve header/footer table render fidelity
```

First PR goal:

Fix the remaining header/footer table render fidelity gap after upstream `0.4.2` and `0.4.3`, using the real DOCX/PDF and screenshots as validation evidence.

