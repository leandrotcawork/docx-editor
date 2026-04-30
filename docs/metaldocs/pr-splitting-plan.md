# PR Splitting Plan

Status: recommendation for upstream/public contribution
Date: 2026-04-30

## Recommendation

Keep the current draft PR as the internal Metal Docs checkpoint, but do not send it upstream as one large PR.

For upstream contribution, split the work into smaller dependency-ordered PRs. This gives reviewers a clear path and avoids mixing rendering, editing, pagination, variable detection, and documentation in one review.

## Current Draft PR

- PR: `Improve DOCX header/footer table fidelity`
- Branch: `codex/eigenpal-professional-patch`
- Changed files: 38
- Approximate diff: 7,409 additions / 725 deletions

This is acceptable as an internal fork checkpoint. It is too broad for a clean upstream review.

## Proposed Upstream Series

### PR 1: Header/Footer Content Extraction And Rendering

Goal:

- Preserve header/footer table blocks in the render path.
- Move header/footer content extraction out of `PagedEditor.tsx` into a testable module.
- Add deterministic coverage for header/footer content blocks.

Main areas:

- `packages/react/src/paged-editor/headerFooterContent.ts`
- `packages/react/src/paged-editor/headerFooterContent.test.ts`
- `packages/react/src/paged-editor/PagedEditor.tsx`
- Header/footer-related layout bridge changes needed for table blocks.

Why first:

This establishes the core structural fix: header/footer content must not be reduced to paragraphs only.

### PR 2: Header/Footer Table Measurement And Painting

Goal:

- Measure header/footer tables with the same fidelity needed by the renderer.
- Align table borders, padding, row height, and image positioning with Word/PDF behavior.

Main areas:

- `packages/core/src/layout-bridge/measureHeaderFooter.ts`
- `packages/core/src/layout-bridge/__tests__/measureHeaderFooter.test.ts`
- `packages/core/src/layout-painter/renderPage.ts`
- `packages/core/src/layout-painter/renderTable.ts`
- `packages/core/src/docx/serializer/tableSerializer.ts`

Why second:

It depends on PR 1 preserving table blocks. Once the blocks exist, measurement and paint can be fixed.

### PR 3: Table Width And Column Operation Semantics

Goal:

- Preserve fixed table width during column operations.
- Keep top-level inserted tables percentage-based.
- Repair percentage add/delete column behavior so cell width totals remain valid.
- Support nested fixed-width tables when parent cell width is known.

Main areas:

- `packages/core/src/prosemirror/extensions/nodes/TableExtension.ts`
- `packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts`

Why third:

This is table-model behavior and should be reviewed independently from header/footer rendering.

### PR 4: Inline Header/Footer Table Editing Parity

Goal:

- Bring inline header/footer table interaction closer to body table behavior.
- Support native `CellSelection` from table cells.
- Fix single-row delete behavior.
- Avoid doubled table dividers in the inline editor.

Main areas:

- `packages/react/src/components/InlineHeaderFooterEditor.tsx`
- `packages/react/src/components/InlineHeaderFooterEditor.test.ts`
- `packages/react/src/styles/editor.css`

Why fourth:

This is editor UX behavior. It builds on the table semantics from PR 3 but should not be bundled with layout fixes.

### PR 5: Body Layout Border And Pagination Fidelity

Goal:

- Align body pagination with Word/PDF behavior for paragraph spacing and table borders.
- Share border measurement between layout and painter.
- Cover continuation rows and grouped paragraph borders.

Main areas:

- `packages/core/src/layout-engine/borders.ts`
- `packages/core/src/layout-engine/index.ts`
- `packages/core/src/layout-engine/integration.test.ts`
- `packages/core/src/layout-painter/renderParagraph.ts`
- `packages/core/src/layout-painter/renderTable.ts`
- `packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts`

Why fifth:

This is not strictly header/footer-specific. It should be isolated so reviewers can evaluate pagination rules on their own.

### PR 6: Referenced Header/Footer Template Variables

Goal:

- Detect template variables inside referenced header/footer package parts.
- Avoid scanning unreferenced header/footer parts.

Main areas:

- `packages/core/src/utils/variableDetector.ts`
- `packages/core/src/utils/__tests__/variableDetector.test.ts`
- Template overlay tests if needed.

Why sixth:

This is a template/plugin data-discovery fix and is logically separate from rendering/editing fidelity.

### PR 7: ProseMirror/DOCX Formatting Round-Trip Fidelity

Goal:

- Preserve style-resolved formatting without serializing it as direct formatting.
- Introduce `_resolvedFormatting` as a baseline for intentional user deltas.
- Use stable structural formatting equality.
- Document width round-trip tolerance.

Main areas:

- `packages/core/src/prosemirror/conversion/toProseDoc.ts`
- `packages/core/src/prosemirror/conversion/fromProseDoc.ts`
- `packages/core/src/prosemirror/conversion/toProseDoc.test.ts`
- `packages/core/src/prosemirror/extensions/core/ParagraphExtension.ts`
- `packages/core/src/prosemirror/schema/nodes.ts`

Why seventh:

This is serializer/conversion correctness. It should be reviewed as a round-trip fidelity PR, not hidden inside table rendering work.

### PR 8: Metal Docs Documentation

Goal:

- Keep the fork-specific dossier and readiness notes versioned.
- Do not send this upstream unless maintainers explicitly want it.

Main areas:

- `docs/metaldocs/*`

Why last:

This documentation is useful for our fork and internal traceability, but most of it is not upstream project documentation.

## Internal Fork Strategy

For the Metal Docs fork:

- Keep the current draft PR as the single checkpoint until the package is consumed.
- Merge it into a fork branch only after final review.
- Do not integrate into Metal Docs directly from the lab path.

For upstream:

- Use the series above.
- Each PR should have its own test plan and concise rationale.
- Avoid including the Metal Docs lab dossier in upstream PRs unless converted into neutral project documentation.

## Final Recommendation

Do not split immediately unless we are preparing an actual upstream submission.

For now:

1. Keep draft PR #1 as the internal source-of-truth checkpoint.
2. Use this plan only when we decide to turn the fork patch into upstream-ready PRs.
3. Before consuming the fork in Metal Docs, create a separate integration branch and test the package as a dependency.
