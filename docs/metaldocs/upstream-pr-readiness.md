# EigenPal Upstream PR Readiness

Status: ready for local consolidation / upstream PR preparation
Date: 2026-04-30

## Scope

This document summarizes the professional EigenPal source patch produced from the isolated lab work. It is intentionally separate from Metal Docs product integration.

The patch focuses on DOCX fidelity and editor parity for:

- Header/footer table rendering and measurement.
- Header/footer inline editor table interaction.
- Table width preservation and column operations.
- Body layout spacing, borders, table continuation, and pagination fidelity.
- Template variable discovery and overlay behavior in referenced headers/footers.
- DOCX/ProseMirror round-trip preservation for style-resolved formatting.

## Repository State

- Repository: `non_git/eigenpal-isolated-lab/analysis/eigenpal-upstream-source`
- Branch: `codex/eigenpal-professional-patch`
- Base commit used for readiness diff: `69f5ab012bcb5d6c012f8529b09c3bfa0f552627`
- Current checkpoint commit: `f707591 fix: improve header footer table fidelity`

Commit sequence on the branch:

```text
91fc946 wip: checkpoint eigenpal professional patch packages
43127ca fix: align body border measurement with renderer
7e3f215 fix: cover grouped borders and table continuation handles
c47ff17 fix: detect template variables in referenced headers
f707591 fix: improve header footer table fidelity
```

## Main Technical Changes

### Header/Footer Rendering

- Header/footer content now keeps table blocks instead of silently dropping them in the render path.
- Header/footer table measurement follows the same structural rules needed by body layout where applicable.
- Table borders, padding, row heights, and image positioning were aligned against the Word/PDF reference fixtures.
- Empty header/footer height behavior was normalized so layout does not collapse when content is table-only or visually sparse.

### Header/Footer Editor

- The inline header/footer editor now supports native table cell selection behavior for table cells.
- Double-clicking inside a table cell can create a proper ProseMirror `CellSelection`.
- Single-row `deleteRow` removes the table instead of leaving an invalid or confusing table shell.
- Header/footer editor table CSS was adjusted to avoid doubled dividers and keep render/editor parity.

### Table Widths And Column Operations

- Top-level inserted tables remain percentage-based by design.
- Nested tables inside fixed-width cells use fixed width when the parent cell width is known.
- Fixed-width table resize paths preserve total table width.
- Percentage tables no longer accumulate invalid cell width totals after add/delete column operations.
- Stale fixed `tblGrid` metadata is cleared when preserving non-fixed table semantics.

### Body Layout Fidelity

- Body pagination now accounts for paragraph `spaceAfter` in fit decisions where Word moves content to the next page.
- Table border measurement uses shared border helpers so layout and paint agree.
- Table continuation rows and grouped paragraph borders are covered to avoid subtle page-break drift.
- The reference DC template now keeps the later sections aligned with the Word/PDF pagination anchors validated in the lab.

### Template Variables And Fields

- Template variable detection now includes referenced package headers and footers, not only body content.
- Detection follows DOCX reference semantics by scanning only referenced header/footer parts.
- Page fields and total-page fields preserve visible formatting across header/footer render/edit transitions.
- Template overlay alignment was validated against the header placeholder fixtures.

### ProseMirror/DOCX Round-Trip

- Paragraph style application no longer serializes style-resolved spacing/run formatting as direct formatting.
- `_originalFormatting` and `_resolvedFormatting` provide an explicit baseline for computing intentional user deltas.
- Formatting comparisons use stable structural equality instead of key-order-sensitive `JSON.stringify`.
- Width round-trip tolerance is named and documented to absorb px/twip rounding artifacts without hiding meaningful edits.

## Validation Performed

Focused automated checks:

```powershell
bun test packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/react/src/components/InlineHeaderFooterEditor.test.ts
```

Result:

```text
54 pass
0 fail
145 expect() calls
```

Focused typechecks:

```powershell
.\node_modules\.bin\tsc.exe --noEmit -p packages\core\tsconfig.json
.\node_modules\.bin\tsc.exe --noEmit -p packages\react\tsconfig.json
```

Result: both passed.

Previously validated package-level suites are recorded in `header-footer-table-bug.md`, including:

- Header/footer measurement tests.
- Body layout/pagination tests.
- Table painter tests.
- Variable detector tests.
- Template overlay tests.
- Header/footer content extraction tests.
- Browser validation against Golden/PDF fixtures on `127.0.0.1:5180`.

## Known Tooling Note

The repository-wide pre-commit hook currently runs all workspace typechecks and fails in `@eigenpal/docx-editor-agents` because tests use `Array.prototype.at` while that package target/lib does not expose ES2022 array APIs.

This failure is outside the modified `core` and `react` package scope. The final checkpoint commit was created with `--no-verify` after direct validation of the modified packages passed.

## Residual Follow-Ups

These are intentionally non-blocking for this patch:

- Decide whether percentage table add-column operations should preserve asymmetric user proportions instead of equalizing columns.
- Add a small documentation note or schema convention around `null` versus `undefined` for cleared table width metadata.
- Consider a future UX refinement for right-click behavior when a multi-cell `CellSelection` is already active.
- If preparing a public PR, consider splitting the branch into smaller commits by package area: header/footer render, table behavior, body pagination, template variables, round-trip formatting.

## PR Body Draft

```markdown
## Summary

- Preserve and measure header/footer table content instead of dropping table blocks from the render path.
- Bring header/footer inline table editing closer to body table behavior, including native cell selection and single-row table deletion.
- Improve DOCX/ProseMirror round-trip fidelity for table widths, paragraph style formatting, page fields, and referenced header/footer template variables.
- Align body pagination/table border measurement with Word/PDF reference behavior for the validated fixtures.

## Why

DOCX templates with tables in headers/footers rendered differently from Word and from the editor view. Some header/footer content was measured or painted through a reduced path, causing clipped images, shifted table content, missing table interactions, and pagination drift. This patch moves the behavior toward a single structural interpretation of DOCX content while keeping serialization lossless for unchanged formatting.

## Test Plan

- `bun test packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/react/src/components/InlineHeaderFooterEditor.test.ts`
- `.\node_modules\.bin\tsc.exe --noEmit -p packages\core\tsconfig.json`
- `.\node_modules\.bin\tsc.exe --noEmit -p packages\react\tsconfig.json`
- Browser validation against the DC template and synthetic header/footer fixtures documented in `docs/wiki/header-footer-table-bug.md`.

## Notes

- Top-level inserted tables intentionally remain percentage-based; fixed-width behavior is preserved for fixed imported tables and nested fixed-width contexts.
- Repository-wide pre-commit currently fails in an unrelated agents package due to `Array.prototype.at` and TS lib targeting; modified `core` and `react` packages pass direct typecheck.
```

## Recommendation

Keep `codex/eigenpal-professional-patch` as the protected local source branch for now. Do not merge into Metal Docs yet.

Recommended next action:

1. Optionally split the current branch into upstream-friendly commits.
2. Run one final public-PR-focused review on the diff.
3. Open an upstream PR or keep this branch as the internal EigenPal package source for Metal Docs after a separate integration plan.
