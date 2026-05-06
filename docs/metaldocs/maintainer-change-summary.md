# Maintainer Change Summary: Header/Footer Tables And DOCX Fidelity

Date: 2026-05-06
Fork branch: `main`
Patch release tag: `metaldocs-eigenpal-v0.2.0`
Patch checkpoint commit: `7cbadeb77eaa97f2e0a07fd7d9a2671fe3f7a753`
Base used for the patch analysis: `69f5ab012bcb5d6c012f8529b09c3bfa0f552627`

## Purpose

This document explains the production-quality EigenPal fork changes made after investigating DOCX templates whose headers contain tables, images, page fields, and template placeholders.

It is written for EigenPal maintainers or reviewers. It is not a line-by-line changelog. It maps the bug, the root causes, the implementation areas, and the files changed so a maintainer can understand the patch before reviewing the code or reproducing the issue with the sample DOCX.

The chronological investigation log remains in:

- `docs/metaldocs/header-footer-table-lab-dossier.md`

## Short Summary For Email

We found that DOCX header/footer tables could be parsed and edited, but the normal paginated renderer used a different reduced path from the inline header/footer editor. That reduced path originally skipped or under-modeled table content, which caused missing tables, clipped logo images, incorrect row heights, shifted separator lines, page field formatting loss, and editor/render mismatch.

The fork changes move header/footer content toward the same structural model used elsewhere in the editor: preserve table blocks, measure them as tables, paint them as tables, and let the inline header/footer ProseMirror editor use normal table selection/command behavior. The work also includes related DOCX fidelity fixes that were exposed by the same reference template: body paragraph spacing, grouped borders, table continuation behavior, template variables in referenced headers/footers, and DOCX/ProseMirror round-trip formatting preservation.

If upstream EigenPal has since added basic header table rendering, the remaining value of this patch is in the deeper fidelity fixes: row-height measurement, image clipping, editor/render parity, table interaction, width semantics, placeholder/page-field formatting, and body pagination alignment.

## Reproduction

Reference document behavior:

1. Open a DOCX whose header contains a table.
2. The left cell contains a logo/image.
3. The right cell contains text, placeholders, and/or page fields.
4. A separator paragraph or border appears below the table.
5. Compare Word/PDF output with EigenPal normal render mode and with EigenPal header edit mode.

Observed failures before the patch:

- Header/footer table content could appear while editing the header/footer but disappear or render differently after leaving edit mode.
- The table could clip the image or collapse row height too tightly.
- The separator line under the header table could shift vertically.
- Text rhythm inside the right table cell differed between normal render mode and header edit mode.
- Table selection, hover, resize handles, and delete behavior in header/footer edit mode were not aligned with body table behavior.
- Page fields and total page fields could lose visible formatting after render/edit transitions.
- Template variables in headers/footers were not reliably discovered if they lived in referenced header/footer parts.
- Body pagination drifted versus Word/PDF because spacing and table border measurement were not always accounted for the same way as painting.

## Root Causes

### 1. Header/footer render path reduced content too early

The inline editor could show tables because it used the ProseMirror conversion path. The normal paginated header/footer renderer used separate extraction logic that was paragraph-oriented. Table blocks could be skipped or not represented with enough structure for measurement and painting.

Main fix:

- Extract header/footer content through a testable conversion module.
- Preserve paragraph and table blocks.
- Convert header/footer tables into the same `FlowBlock` shape used by the layout/painter stack.

Main files:

- `packages/react/src/paged-editor/headerFooterContent.ts`
- `packages/react/src/paged-editor/PagedEditor.tsx`

### 2. Header/footer table measurement did not model Word-like row height well enough

After tables reached the render path, image/table rows still did not match Word/PDF. The important case was a single row with a logo in one cell and text in another. Word treats row height as the maximum required height across sibling cells, not as a collapsed content-only height and not as a sum of unrelated sibling content.

Main fix:

- Convert header/footer table content into measurable table blocks.
- Resolve widths, padding, borders, and row content height before painting.
- Reconcile measured header/footer table row heights so image and text cells reserve the correct vertical space.

Main files:

- `packages/core/src/layout-bridge/measureHeaderFooter.ts`
- `packages/core/src/layout-painter/renderPage.ts`
- `packages/core/src/layout-painter/renderTable.ts`
- `packages/core/src/docx/serializer/tableSerializer.ts`

### 3. Header/footer inline editing was not using normal table interaction semantics

The inline header/footer editor is a separate ProseMirror editor surface. Rendering a table there is not enough: selection and table commands need to resolve DOM cell positions into a real ProseMirror `CellSelection`.

Main fix:

- Add helpers that resolve table cell DOM elements to ProseMirror positions.
- Create native `CellSelection` on double-click in header/footer table cells.
- Preserve context menu and command behavior for table actions.
- Make single-row `deleteRow` remove the table instead of leaving a confusing shell.
- Adjust CSS so header/footer tables do not show doubled dividers and match normal render more closely.

Main files:

- `packages/react/src/components/InlineHeaderFooterEditor.tsx`
- `packages/react/src/styles/editor.css`
- `packages/core/src/prosemirror/extensions/nodes/TableExtension.ts`

### 4. Table width metadata could drift during editing

Column add/delete/resize operations could produce invalid totals or preserve stale grid data across table width modes. This was especially visible when inserted percentage tables and fixed imported tables were edited.

Main fix:

- Keep top-level inserted tables percentage-based.
- Use fixed widths when inserting nested tables in known fixed-width table cells.
- Normalize fixed-width resize totals.
- Repair percentage add/delete column behavior so totals remain valid.
- Clear stale fixed grid metadata when table semantics are not fixed.

Main files:

- `packages/core/src/prosemirror/extensions/nodes/TableExtension.ts`
- `packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts`

### 5. Body pagination drift came from layout/paint disagreement

The same reference DOCX exposed body layout differences: section headings, border spacing, table continuation, and later page breaks did not line up with Word/PDF. The core issue was that layout decisions and painter output did not always use the same border and spacing assumptions.

Main fix:

- Share border measurement helpers.
- Account for paragraph `spaceAfter` and grouped borders in fit decisions.
- Refine top-of-page spacing behavior.
- Cover table continuation rows so borders and pagination anchors agree.

Main files:

- `packages/core/src/layout-engine/borders.ts`
- `packages/core/src/layout-engine/index.ts`
- `packages/core/src/layout-engine/paginator.ts`
- `packages/core/src/layout-engine/types.ts`
- `packages/core/src/layout-painter/renderParagraph.ts`
- `packages/core/src/layout-painter/renderTable.ts`

### 6. Template variables in referenced headers/footers were not fully discovered

The reference template uses placeholders inside headers. Detecting variables only in body content misses real DOCX template variables when they live in referenced header/footer parts.

Main fix:

- Scan referenced headers and footers according to section references.
- Avoid scanning unreferenced package parts as if they were active document content.
- Improve overlay positioning for raw visible tags.

Main files:

- `packages/core/src/utils/variableDetector.ts`
- `packages/react/src/plugins/template/components/TemplateHighlightOverlay.tsx`

### 7. Round-trip formatting needed a baseline for style-resolved formatting

Applying a paragraph style and then exporting could serialize inherited style formatting as direct formatting. This creates DOCX churn and makes unchanged content look edited.

Main fix:

- Track original imported formatting and resolved formatting separately.
- Compute intentional user deltas against the right baseline.
- Replace key-order-sensitive equality checks with stable structural equality.
- Add a named twip tolerance for px/twip width round-trip noise.

Main files:

- `packages/core/src/prosemirror/conversion/toProseDoc.ts`
- `packages/core/src/prosemirror/conversion/fromProseDoc.ts`
- `packages/core/src/prosemirror/extensions/core/ParagraphExtension.ts`
- `packages/core/src/prosemirror/schema/nodes.ts`

## Implementation Map

| Area | Files | What changed | Why |
| --- | --- | --- | --- |
| Header/footer extraction | `packages/react/src/paged-editor/headerFooterContent.ts`, `PagedEditor.tsx` | Added `convertHeaderFooterToContent`, table conversion, visual bounds helpers, and field formatting extraction. | Normal render mode needed to receive real table blocks instead of paragraph-only content. |
| Header/footer measurement | `packages/core/src/layout-bridge/measureHeaderFooter.ts` | Added paragraph/table conversion, table width resolution, row/cell measurement, and section header/footer measurement helpers. | Header/footer occupied height must include table content, padding, borders, images, and text rhythm. |
| Header/footer painting | `packages/core/src/layout-painter/renderPage.ts`, `renderTable.ts` | Added header/footer table row reconciliation, table rendering in header/footer content, image-only paragraph handling, and table continuation/border adjustments. | Rendered output needed to match Word/PDF and avoid clipping images inside header tables. |
| Table model and commands | `packages/core/src/prosemirror/extensions/nodes/TableExtension.ts` | Improved table width attrs, add/delete column semantics, fixed/percentage width normalization, nested table width logic, and single-row table deletion. | Header/footer editor and body editor needed stable table behavior after edits. |
| Inline header/footer editor | `packages/react/src/components/InlineHeaderFooterEditor.tsx`, `packages/react/src/styles/editor.css` | Added DOM-to-cell selection helpers, native `CellSelection` creation, context menu handling, and table CSS parity. | Header/footer table editing needed selection, commands, resize visuals, and render/editor parity closer to the body editor. |
| Body layout fidelity | `packages/core/src/layout-engine/borders.ts`, `index.ts`, `paginator.ts`, `renderParagraph.ts`, `renderTable.ts` | Shared border measurement, spacing fit adjustments, grouped border handling, and continuation row fixes. | The reference document pagination drifted because layout and paint were not measuring the same visual output. |
| Variables and overlays | `packages/core/src/utils/variableDetector.ts`, `TemplateHighlightOverlay.tsx` | Detect variables in referenced headers/footers and align overlay rectangles to raw rendered tags. | Template placeholders inside headers/footers must be discovered and highlighted like body placeholders. |
| DOCX round-trip | `toProseDoc.ts`, `fromProseDoc.ts`, `ParagraphExtension.ts`, `schema/nodes.ts` | Added original/resolved formatting baselines and stable formatting comparison. | Avoid writing inherited style formatting as direct formatting when unchanged. |

## Test Coverage Added Or Expanded

Header/footer and rendering:

- `packages/react/src/paged-editor/headerFooterContent.test.ts`
- `packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts`
- `packages/core/src/layout-bridge/__tests__/measureHeaderFooter.test.ts`
- `packages/core/src/layout-painter/renderTable.test.ts`

Table editing:

- `packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts`
- `packages/react/src/components/InlineHeaderFooterEditor.test.ts`

Variables and overlays:

- `packages/core/src/utils/__tests__/variableDetector.test.ts`
- `packages/react/src/plugins/template/components/TemplateHighlightOverlay.test.ts`

Round-trip and layout:

- `packages/core/src/prosemirror/conversion/toProseDoc.test.ts`
- `packages/core/src/layout-bridge/__tests__/toFlowBlocks-field-formatting.test.ts`
- `packages/core/src/layout-engine/integration.test.ts`
- `packages/core/src/docx/serializer/tableSerializer.test.ts`

## Validation Notes

The fork was validated with focused tests and typechecks for the modified `core` and `react` packages. The broader lab dossier also records browser comparisons against:

- A real DC template exported from Word/PDF.
- Synthetic header/footer table fixtures.
- Header/footer placeholder fixtures.
- Body layout fixtures for spacing, grouped borders, table continuation, and page-break behavior.

For an upstream review, the most useful evidence is:

1. The failing DOCX template with header table, logo image, placeholders, and page fields.
2. A PDF exported from Word from the same DOCX.
3. Screenshots comparing Word/PDF, vanilla EigenPal, and the fork.
4. The focused tests listed above.

## Relationship To Current Vanilla EigenPal

If the current upstream/vanilla editor now renders basic header tables, that likely addresses only the first failure layer: preserving table blocks enough to display them. The fork also addresses the second and third layers:

- Header table row height and image clipping.
- Header separator and paragraph spacing fidelity.
- Right-cell text rhythm.
- Editor/render parity after entering and leaving header edit mode.
- Native cell selection and table command behavior in inline header/footer editors.
- Page field formatting preservation.
- Template variable detection in referenced header/footer parts.
- Body pagination drift caused by spacing and border measurement differences.

That distinction matters because a table can be visible and still be materially different from Word.

## Suggested Email Framing

Suggested short message:

```text
We investigated a DOCX fidelity issue around tables inside headers/footers. The table data was present and editable in the header editor, but the normal paginated renderer and the inline editor did not behave consistently with Word/PDF. In our real template this caused missing or visually incorrect header tables, clipped logo images, shifted separator lines, page-field formatting problems, and table editing differences versus body tables.

We prepared a fork with a documented patch and tests. The core idea is to preserve header/footer table blocks through extraction, measurement, painting, and inline ProseMirror editing instead of treating header/footer rendering as a paragraph-only/reduced path. The attached summary maps the root causes and the files changed.

I can provide the DOCX/PDF fixture that reproduces the issue and screenshots comparing Word, vanilla EigenPal, and the fork.
```

## Review Scope For Maintainers

The current fork patch is broad. If sending this upstream, it is probably easier to review as multiple PRs:

1. Header/footer content extraction.
2. Header/footer table measurement and painting.
3. Table width and column operation semantics.
4. Inline header/footer table editing parity.
5. Body layout border and pagination fidelity.
6. Referenced header/footer template variables.
7. ProseMirror/DOCX formatting round-trip fidelity.

The proposed split is documented in:

- `docs/metaldocs/pr-splitting-plan.md`
