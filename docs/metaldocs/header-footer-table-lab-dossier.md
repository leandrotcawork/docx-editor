# Header/Footer Table Bug

## Current target
When a DOCX has table content inside header/footer:
- it appears while editing the header/footer
- then disappears or gets clipped after leaving header/footer edit mode

## Repro harness
- Fixture generator: `scripts/gen-header-footer-table-fixture.mjs`
- Fixture output: `public/fixtures/header-footer-table.docx`
- Repro page: `/t10` (`src/pages/T10HeaderFooterTables.tsx`)

## T10 workflow
1. Load `header-footer-table.docx`.
2. Take baseline snapshot.
3. Double click header and verify table visible.
4. Take snapshot while still in header edit mode.
5. Click body (exit header edit).
6. Take snapshot again.
7. Repeat for footer.

## Snapshot fields
- `tableNodes`: count of `table`/`.layout-table` nodes under header/footer container
- `htmlLength`: raw container HTML length
- `overflow`: inline overflow style on container
- `maxHeight`: inline max-height style on container

## Initial analysis notes
- Lab uses `@eigenpal/docx-js-editor@0.0.35` (unpatched upstream package).
- This lab is intentionally outside product code and branch logic.
- Existing spike build has unrelated TypeScript errors in old files; they do not block runtime repro on T10.

## Evidence from uploaded DC template
Captured in the in-app browser on `http://localhost:4173/t10`.

Baseline after loading `DC_Template_Descricao_Cargo.docx`:
```json
{
  "header": {
    "tableNodes": 0,
    "htmlLength": 449,
    "overflow": "hidden",
    "maxHeight": "65px"
  },
  "footer": {
    "tableNodes": 0,
    "htmlLength": 446,
    "overflow": "hidden",
    "maxHeight": "65px"
  }
}
```

After double-clicking the header:
```json
{
  "renderedHeaderText": "",
  "headerEditorTables": 1,
  "headerEditorText": "CODIGO {doc_code} REVISAO {revision_number} AREA {controlled_by_area} PAGINA 1 de 2"
}
```

After clicking back into the body:
```json
{
  "renderedHeaderTables": 0,
  "pmEditors": 1
}
```

Conclusion: the DOCX header table is parsed well enough for Eigenpal's header edit mode (`.ProseMirror` contains one table), but the normal paginated page renderer emits no table DOM inside `.layout-page-header`. This is a render pipeline mismatch, not a lost DOCX-table problem.

## Root cause found
There are two header/footer render paths:
- Inline edit mode uses the ProseMirror document conversion path, so the table appears.
- Normal paginated header/footer render uses a separate helper named `vs(...)`.

In `@eigenpal/docx-js-editor@0.0.35`, `vs(...)` only converts raw header/footer blocks where `block.type === "paragraph"`.
It silently skips raw `table` blocks. That means table data exists in the imported package but is removed before the normal header/footer renderer receives it.

The uploaded `DC_Template_Descricao_Cargo.docx` proves this:
```json
{
  "section": {
    "titlePg": false,
    "headerReferences": [
      { "type": "default", "rId": "rId7" },
      { "type": "first", "rId": "rId11" }
    ],
    "footerReferences": [
      { "type": "default", "rId": "rId8" },
      { "type": "first", "rId": "rId12" }
    ]
  },
  "headers": [
    { "id": "rId7", "blockTypes": ["table", "paragraph"] },
    { "id": "rId11", "blockTypes": ["paragraph"] }
  ],
  "footers": [
    { "id": "rId8", "blockTypes": ["paragraph", "table"] },
    { "id": "rId12", "blockTypes": ["paragraph"] }
  ]
}
```

## Experimental fix
Patched only in the isolated lab under `non_git/eigenpal-isolated-lab`.

The successful experiment changes `vs(...)` so header/footer content uses the same broad conversion pipeline as the body:
1. raw document blocks -> ProseMirror doc via `xl(...)`
2. ProseMirror doc -> layout blocks via `zf(...)`
3. layout blocks -> measured blocks via `Rm(...)`

Because this allows `table` blocks to reach the renderer, `lm(...)` also needs to render `table` blocks, not only paragraphs. The lab patch added a table branch that uses the existing `vC(...)` table renderer.

The lab now also includes a reproducible patch script:
- `scripts/apply-eigenpal-lab-patch.mjs`
- `npm run patch:eigenpal`
- `npm run dev` now reapplies the patch and starts Vite with `--force`, so the prebundle is rebuilt from the patched Eigenpal files.

After the experiment, loading `DC_Template_Descricao_Cargo.docx` through `/t10` gives:
```json
{
  "headerTables": 4,
  "footerTables": 4,
  "allTables": 30,
  "headerText": "CODIGO {doc_code} REVISAO {revision_number} AREA {controlled_by_area} PAGINA 1 de 2"
}
```

Before the experiment, the same document gave:
```json
{
  "headerTables": 0,
  "footerTables": 0
}
```

## Header height / line-break experiment
User observation: if a line break is added inside the header table, normal render mode looks much closer to the expected Word layout.

Browser experiment on `/t10` confirmed the behavior:

Clean header table after the table-render fix:
```json
{
  "headerStyle": "height: 46.9036px",
  "tableStyle": "height: 29px",
  "cellHeight": "29px",
  "tableText": "CODIGO {doc_code} REVISAO {revision_number}\\nAREA {controlled_by_area} PAGINA 1 de 2"
}
```

After adding one blank line inside the header table:
```json
{
  "headerStyle": "height: 64.8072px",
  "tableStyle": "height: 46.9036px",
  "cellHeight": "46.9036px",
  "tableText": "\\nCODIGO {doc_code} REVISAO {revision_number}\\nAREA {controlled_by_area} PAGINA 1 de 2"
}
```

The difference is about `17.9px`, which matches one measured paragraph/line box in this renderer. This suggests the remaining fidelity issue is not table presence; it is table row/header height calculation.

DOCX evidence:
- The header table row has no explicit `w:trHeight`.
- The table/cells have vertical margins of `0`.
- The following header paragraph has `spaceBefore: 120` and a bottom border.
- The logo image is `186px x 29px` after EMU conversion.

Current hypothesis: Word/edit-mode layout effectively includes an extra line-box / paragraph-mark height around the table content, while the normal layout renderer collapses the row to the strict max content height (`29px`). Adding a blank line forces the missing line-box into the measured table height.

## Header table row-height correction
Implemented in the isolated lab patch script on `2026-04-28`.

The correction is intentionally narrow:
- applies only in the static header/footer renderer (`lm(...)`)
- applies only to table rows without an explicit DOCX row height
- applies only when the row contains an image and the measured row height is lower than `image height + one measured paragraph line`

Why this shape:
- The original disappearance bug was a missing table render path.
- The remaining visual bug was the static renderer collapsing the header table row to media/content height.
- Edit mode and Word reserve line-box/paragraph structure around the table content.
- The rule derives the missing line from measured paragraph blocks already present in the row instead of hardcoding `17.9px`.

Browser verification after restarting Vite with `--force` and loading `/t10`:

```json
{
  "headerCount": 4,
  "headerTableCount": 4,
  "tableStyle": "height: 40.3932px",
  "rowCount": 4,
  "rowStyle": "height: 40.3932px",
  "consoleErrors": []
}
```

Previous collapsed static render was:

```json
{
  "tableStyle": "height: 29px",
  "rowStyle": "height: 29px"
}
```

The value `40.3932px` comes from Eigenpal's measured logo/image height plus one measured text line in this imported header row. This is closer to the edit-mode behavior without requiring the user to insert a manual blank line.

## Header paragraph spacing parity correction
Implemented in the isolated lab patch script on `2026-04-28`.

After the row-height correction, two visual mismatches remained compared with Word/edit mode:
- The red separator line below the header table was too high.
- The two text paragraphs in the right table cell were too tight in static mode.

DOCX XML evidence:

```xml
<w:pPr>
  <w:pBdr>
    <w:bottom w:val="single" w:sz="8" w:space="1" w:color="7A1F2B"/>
  </w:pBdr>
  <w:spacing w:before="120"/>
</w:pPr>
```

The separator is an empty paragraph after the table, not part of the table itself. `w:before="120"` converts to `8px`.

Edit-mode DOM evidence:

```json
[
  {
    "paragraph": "first right-cell line",
    "style": "text-align: right; margin: 0px 0px 2.67px; text-indent: 0px"
  },
  {
    "paragraph": "red separator paragraph",
    "style": "margin: 8px 0px 0px; text-indent: 0px; border-bottom: 1.33px solid rgb(122, 31, 43)"
  }
]
```

Static-mode DOM before the correction had the border and text alignment, but not the paragraph spacing:

```json
[
  {
    "paragraph": "first right-cell line",
    "style": "position: relative; text-align: right"
  },
  {
    "paragraph": "red separator paragraph",
    "style": "position: relative; box-sizing: border-box; border-bottom: 1px solid rgb(122, 31, 43); padding: 0px 0px 1.33333px; margin-bottom: 0px"
  }
]
```

Root cause: `Gn(...)` knows the paragraph attrs but static header/footer rendering was not converting `attrs.spacing.before/after` into CSS margins. Header/footer tables call the same `Gn(...)` through the nested table renderer, so this one missing behavior affected both the separator paragraph and table-cell paragraph rhythm.

Patch shape:
- in `Gn(...)`, only when `context.section` is `"header"` or `"footer"`, apply paragraph spacing as `marginTop` / `marginBottom`
- do not change normal body paragraphs
- do not hardcode the Metal template values; use parsed Eigenpal spacing values

Browser verification after restarting Vite with `--force`:

```json
{
  "headerTableCount": 4,
  "tableStyle": "height: 40.3932px",
  "rowStyle": "height: 40.3932px",
  "paragraphs": [
    {
      "text": "CÓDIGO  {doc_code}    REVISÃO  {revision_number}",
      "style": "position: relative; text-align: right; margin-bottom: 2.66667px"
    },
    {
      "text": " ",
      "style": "position: relative; margin-top: 8px; box-sizing: border-box; border-bottom: 1px solid rgb(122, 31, 43); padding: 0px 0px 1.33333px; margin-bottom: 0px"
    }
  ],
  "consoleErrors": []
}
```

## Body gap / Enter jump experiment
The Word screenshot showed the first body heading (`DESCRICAO DE CARGO`) lower than Eigenpal's initial normal render. The uploaded DOCX contains an empty first body paragraph with:

```json
{
  "type": "paragraph",
  "content": [],
  "formatting": {
    "spaceBefore": 1800
  }
}
```

`spaceBefore: 1800` is `120px` using the same twip-to-pixel conversion already used elsewhere in the editor (`1800 / 15 = 120`).

Initial normal render on the fresh Vite lab (`http://localhost:5173/t10?...`) measured:

```json
{
  "firstEmptyParagraph": {
    "top": 0,
    "height": 17.9
  },
  "descriptionHeading": {
    "top": 17.9,
    "height": 17.9
  }
}
```

That means the imported empty paragraph is rendered as only a line box (`~17.9px`) and its `spaceBefore` is not applied in the initial layout.

After pressing Enter in the first body gap, Eigenpal creates additional empty paragraphs. Each inserted paragraph contributes about:

```text
137.9px = 120px spaceBefore + 17.9px empty line box
```

Observed after two inserted empty paragraphs:

```json
{
  "emptyParagraphs": [
    { "top": 0, "height": 17.9 },
    { "top": 137.898, "height": 17.9 },
    { "top": 275.801, "height": 17.9 }
  ],
  "descriptionHeading": {
    "top": 293.699,
    "height": 17.9
  }
}
```

Conclusion: the body gap exists semantically in the DOCX. The raw import model preserves it, but the initial normal render path ignores `spaceBefore` on the imported empty paragraph. The live editing path then honors/inherits that spacing when Enter creates new empty paragraphs, causing the visible jump.

This should not be fixed with a hardcoded CSS gap. The next root-cause target is the imported empty paragraph conversion/measurement path: compare raw document formatting, ProseMirror paragraph attrs, and layout measurement attrs before and after Enter.

## Body first paragraph `spaceBefore` correction
Implemented in the isolated lab patch script on `2026-04-28`.

Reference file:
- `C:\Users\leandro.theodoro.MN-NTB-LEANDROT\Downloads\DC_Template_Descricao_Cargo.docx`
- copied into the lab as `public/fixtures/dc-template-descricao-cargo.docx`

DOCX XML evidence:

```xml
<w:pPr>
  <w:tabs>
    <w:tab w:val="left" w:pos="948"/>
  </w:tabs>
  <w:spacing w:before="1800"/>
</w:pPr>
```

The paragraph containing `DESCRIÇÃO DE CARGO` itself has `spaceBefore: 1800`, which converts to `120px`.

Initial static render before the correction:

```json
[
  {
    "text": "DESCRIÇÃO DE CARGO",
    "top": "0px",
    "height": "17.9036px"
  },
  {
    "text": "",
    "top": "17.9036px",
    "height": "17.9036px"
  }
]
```

Root cause:
- The parsed raw DOCX model preserved `formatting.spaceBefore: 1800`.
- The flow block conversion preserved it as paragraph spacing.
- The measurement path could calculate it.
- But the paginator suppressed leading spacing whenever a fragment started at the page/column top:

```js
E = cursorY === topMargin ? 0 : spacingBefore
```

Pressing Enter appeared to "fix" the visual because it made `DESCRIÇÃO DE CARGO` no longer be the first fragment. That caused the same spacing to be honored, but it also mutated the document by inserting another paragraph, producing a bad exported DOCX.

Patch shape:
- Change the paginator to preserve the real leading spacing even when the fragment starts at the page/column top.
- Do not insert any paragraph.
- Do not hardcode `120px`.
- Use the already parsed/converted DOCX spacing value.

Verification after restarting Vite with `--force`:

```json
[
  {
    "text": "DESCRIÇÃO DE CARGO",
    "top": "120px",
    "height": "17.9036px"
  },
  {
    "text": "",
    "top": "137.904px",
    "height": "17.9036px"
  },
  {
    "text": "{doc_title}",
    "top": "235.807px",
    "height": "52.0832px"
  }
]
```

This matches the user-observed Word behavior without changing the document model.

## Body section heading border spacing correction
Implemented in the isolated lab patch script on `2026-04-28`.

User page-by-page drift report:
- Word had part of section 05 continuing on page 3.
- Eigenpal was fitting too much content on page 2/page 3.
- Word started section 09 on page 4, while Eigenpal initially kept section 09 at the bottom of page 3.

DOCX XML evidence for the numbered section headings (`01` through `11`):

```json
{
  "spacing": {
    "before": 360,
    "after": 120,
    "line": 280,
    "lineRule": "auto"
  },
  "bottomBorder": {
    "style": "single",
    "size": 6,
    "space": 6,
    "color": "7A1F2B"
  }
}
```

`w:pBdr/w:bottom/@w:space="6"` converts to `8px`, and the visible border width converts to about `1px`.

Browser evidence before the correction:

```json
{
  "text": "01 MISSAO DO CARGO",
  "height": "22.7864px",
  "padding": "0px 0px 8px",
  "borderBottom": "1px solid rgb(122, 31, 43)",
  "boxSizing": "border-box"
}
```

Root cause:
- The renderer was correctly drawing paragraph border spacing as CSS `padding-bottom: 8px` plus the red bottom border.
- The paginator still treated the paragraph fragment as only the text-line height.
- Because the element uses `box-sizing: border-box`, the red line was visually squeezed upward inside the same `22.7864px` box.
- Every numbered heading was missing about `9px` from pagination height, which accumulates enough to change page breaks.

Patch shape:
- Add a generic paginator helper that derives paragraph border-box contribution from parsed paragraph borders.
- Count top border space/width on the first fragment.
- Count bottom border space/width on the last fragment.
- Apply this to normal body paragraph pagination, not to a Metal-specific selector or title string.

Verification after restarting Vite with `--force`:

```json
{
  "sectionHeadingHeightBefore": "22.7864px",
  "sectionHeadingHeightAfter": "31.7864px",
  "page2Section05": {
    "headingTop": "742.348px",
    "firstTableFragmentTop": "782.134px"
  },
  "page3FirstBlock": {
    "kind": "table",
    "text": "DECISAO / PERMISSAO DECIDE SOZINHO? LIMITE / CRITERIO QUANDO ESCALAR",
    "top": "0px"
  },
  "page4FirstBlock": {
    "text": "09 COMPETENCIAS COMPORTAMENTAIS",
    "top": "24px"
  }
}
```

This confirms both user-observed page-break symptoms:
- section 05 now continues onto page 3
- section 09 now starts on page 4

## Patch locations in lab
- `node_modules/@eigenpal/docx-js-editor/dist/chunk-P3HJ63Z4.mjs`
- `node_modules/@eigenpal/docx-js-editor/dist/chunk-DQOF33RE.js`
- `node_modules/@eigenpal/docx-js-editor/dist/chunk-2HDYCD2Q.mjs`
- `node_modules/@eigenpal/docx-js-editor/dist/chunk-EV3CM6TU.js`

Backups:
- `chunk-P3HJ63Z4.mjs.pre-header-table-experiment.bak`
- `chunk-P3HJ63Z4.mjs.pre-vs-table-experiment.bak`
- `chunk-DQOF33RE.js.pre-header-table-experiment.bak`
- `chunk-DQOF33RE.js.pre-vs-table-experiment.bak`

## Next experiments
1. Port the experiment into a clean upstream Eigenpal fork/source patch, not the minified bundle.
2. Add regression coverage for header/footer raw content containing table blocks.
3. Validate first-page headers/footers (`titlePg`) and default headers/footers independently.
4. Re-check layout fidelity for images inside header tables; the uploaded document has the logo inside the header table.
5. Test a minimal row-height correction for header/footer tables: preserve/derive an implicit line-box height without requiring users to add a manual blank line.

## Header table row-height root cause

Focused scope: make the static header match Word/PDF before continuing body page-break work.

PDF ground truth from `DC_Template_Descricao_Cargo.pdf`, page 2:

```json
{
  "pageSizePx": { "width": 793.76, "height": 1122.56 },
  "logoImage": { "topPx": 48.0, "heightPx": 29.27 },
  "headerSeparatorLineTopPx": 105.12,
  "section01UnderlineTopPx": 144.03
}
```

Bad Eigenpal static header state:

```json
{
  "headerTableHeight": "40.3932px",
  "imageHeight": "29px",
  "headerSeparatorLineTopPxApprox": 116,
  "section01UnderlineTopPxApprox": 144
}
```

The body/Section 01 underline was already aligned with the PDF. The header separator was about `11px` too low.

Root cause:
- The header row has two cells side by side: logo image on the left, two text lines on the right.
- The lab heuristic was calculating implicit row height as `imageHeight + textHeight`.
- For table cells in the same row, Word lays out row height as the maximum required cell height, not the sum of sibling cell heights.
- The inflated row height vertically centered the logo and pushed the following bordered paragraph down.

Patch shape:
- For header/footer table rows without explicit `w:trHeight`, calculate the image/text contribution as `Math.max(imageHeight, textHeight)`.
- Keep this inside the header/footer static table render path.
- Do not hardcode this template, logo, text, or Metal-specific selectors.

Verification after restart with Vite `--force`:

```json
{
  "headerTableHeightBefore": "40.3932px",
  "headerTableHeightAfter": "29px",
  "pdfLogoHeightPx": 29.27,
  "eigenpalHeaderSeparatorTopPxApprox": 104,
  "pdfHeaderSeparatorTopPx": 105.12
}
```

Conclusion:
- Header table static render is now within about `1px` of the PDF for the separator line.
- The fix is generic table-row sizing logic: sibling cells contribute by max height, not summed height.

## Empty bordered header paragraph

Follow-up finding:
- Adding visible text like `dsdas` to the separator paragraph made the header look correct.
- Removing that text made the red separator line jump upward.

Root cause:
- The separator is an empty Word paragraph with `w:pBdr/w:bottom` and `w:spacing w:before="120"`.
- In Word, an empty paragraph still has a paragraph mark and therefore reserves a normal line box.
- The lab had an experimental collapse rule that replaced empty bordered header/footer paragraphs with only border spacing/width.
- That rule was too aggressive: it removed the paragraph mark line height that Word keeps.

Correct behavior:
- Keep the row-height fix for header/footer tables.
- Do not collapse empty bordered header/footer paragraphs.
- Let the normal paragraph renderer create the empty line box.

Verification without helper text:

```json
{
  "fixtureHasDsdas": false,
  "headerTableHeight": "29px",
  "emptySeparatorParagraph": {
    "text": "NBSP",
    "lineCount": 1,
    "lineHeight": "17.9036px",
    "marginTop": "8px",
    "borderBottom": "1px solid rgb(122, 31, 43)"
  },
  "eigenpalHeaderSeparatorTopPxApprox": 103,
  "pdfHeaderSeparatorTopPx": 105.12
}
```

`dsdas` was useful only as a diagnostic marker. It is not part of the fix.

## Header edit toolbar table context

User observation:
- With a DOCX header table visible in edit mode, clicking inside the header did not show table controls such as border color.
- A diagnostic DOCX with visible table borders made the issue easier to see.

Browser evidence before the correction:

```json
{
  "bodyProseMirror": {
    "tableCount": 10,
    "tdCount": 117
  },
  "headerProseMirror": {
    "tableCount": 1,
    "thCount": 2,
    "tdCount": 0,
    "activeCellCount": 1
  },
  "toolbar": {
    "hasBorderColor": false,
    "hasCellFillColor": false,
    "hasMoreTableOptions": false
  }
}
```

Important distinction:
- The header edit view did recognize a table cell enough to apply `.activeCell`.
- The toolbar did not receive/update `pmTableContext`, so it behaved as if the selection was not inside a table.

Root cause:
- The header/footer inline editor calls the parent selection handler `Vo`.
- `Vo` calls `I()` to choose the active `EditorView`: body editor normally, header/footer editor while header/footer mode is active.
- But `Vo` was memoized without `I` in its dependency list:

```js
useCallback(..., [a$3, Bt, At])
```

- When entering header edit mode, `I()` changed, but `Vo` could keep a stale closure pointing at the body editor.
- The header cell received `.activeCell`, but `Ge(g.state)` was computed against the body editor, so `pmTableContext` stayed null.

Patch shape:
- Add `I` to the `Vo` dependency list in the lab bundle patch.
- Do not special-case headers, tables, or this template.
- Let the existing toolbar logic work once it receives the correct active editor view.

Verification after restarting Vite with `--force`:

```json
{
  "headerProseMirror": {
    "tableCount": 1,
    "thCount": 2,
    "tdCount": 0,
    "activeCellCount": 1
  },
  "toolbarButtons": [
    "Border style",
    "Border Color",
    "Border width",
    "Cell Fill Color",
    "More table options"
  ]
}
```

## Header table sizing and resize metadata

User observation:
- After table controls started appearing, the header table still felt different from Word.
- The table looked like a table visually, but table sizing/resizing felt unreliable.

DOCX evidence:
- The header contains one real table with two columns.
- `w:tblW` is `9026 dxa`.
- `w:gridCol` is `[4200, 4826]`.
- In the editor's px conversion this is approximately `[280px, 322px]`, total `602px`.

Browser evidence before the correction, inside header edit mode:

```json
{
  "tableStyle": "--default-cell-min-width: 100px; min-width: 200px;",
  "col0": null,
  "col1": null,
  "cells": [
    { "width": "280px" },
    { "width": "322px" }
  ]
}
```

After dragging the column divider once:

```json
{
  "tableStyle": "--default-cell-min-width: 100px; min-width: 342px;",
  "col0": "width: 242px;",
  "col1": null
}
```

Root cause:
- The DOCX converter preserved cell `width` / `widthType`, but did not initialize ProseMirror table cell `colwidth`.
- `prosemirror-tables` uses `colwidth` to build stable `colgroup` sizing and column resize behavior.
- Without `colwidth`, the first render is visual-only sizing on the cells; after a drag, only the touched column receives `col` metadata.

Patch shape:
- When a DOCX cell has `widthType === "dxa"`, a numeric width, and no `gridSpan`, initialize `colwidth` to the same converted px value.
- This is not a template-specific hardcode. It maps existing DOCX width metadata into the editor's native resize metadata.
- For colspan cells, do not invent column splits yet. That should be a separate, measured fix if needed.

Verification after restarting Vite with `--force`, fresh import, then entering header edit mode:

```json
{
  "tableStyle": "--default-cell-min-width: 100px; width: 602px;",
  "col0": "width: 280px;",
  "col1": "width: 322px;",
  "handleOnHover": true
}
```

## Header table borders and image clipping

User observation:
- In Word, when table borders are visible, the border wraps the logo cleanly.
- In the lab import, the static header table clipped or visually cut into the logo.
- Entering header edit mode still looked different from the static header.

DOCX evidence from `DC_Template_Descricao_Cargo.docx`:
- Header table has no explicit `w:trHeight`.
- Header table has zero cell margins on both cells.
- Logo image size is `1771650 x 278918 EMU`, approximately `186 x 29px`.
- The visible-border reference uses table-level `w:tblBorders`, not per-cell `w:tcBorders`.
- Table borders use `w:color="auto"`.

Browser evidence before this correction:

```json
{
  "staticTable": { "height": 29 },
  "staticCell": {
    "height": 29,
    "boxSizing": "border-box",
    "overflow": "hidden",
    "borderTop": "0.8px solid rgb(0, 0, 0)",
    "borderBottom": "0.8px solid rgb(0, 0, 0)"
  },
  "staticImage": { "height": 29 }
}
```

Root causes:
- Static renderer: row height was computed from content height only. With `border-box` and `overflow:hidden`, a `29px` image inside a `29px` bordered cell leaves no room for the top/bottom borders.
- Header editor: ProseMirror cell `toDOM` already had a border renderer, but it emitted invalid CSS for DOCX table-level borders with `color.rgb === "auto"` (`#auto`). Browsers dropped the border style, so the editor looked borderless while the static renderer showed borders.

Patch shape:
- Normalize ProseMirror table cell border CSS:
  - `auto` color becomes black.
  - both DOCX raw `size` and normalized `width` are accepted.
  - `none` / `nil` / zero-width borders still render as no border.
- In static header/footer table rendering, when a row has no explicit height, include the max top+bottom cell border thickness in the minimum row height.
- This is generic table rendering logic, not a template-specific adjustment.

Verification after restarting Vite with `--force`, fresh import of the visible-border fixture:

```json
{
  "staticTable": { "heightBefore": 29, "heightAfter": 31 },
  "staticCell": {
    "heightAfter": 31,
    "borderTop": "0.8px solid rgb(0, 0, 0)",
    "borderBottom": "0.8px solid rgb(0, 0, 0)"
  },
  "staticImage": {
    "height": 29,
    "topAfter": 50.3
  },
  "editTable": { "height": 33.588 },
  "editCell": {
    "height": 32.788,
    "borderTop": "0.8px solid rgb(0, 0, 0)",
    "borderBottom": "0.8px solid rgb(0, 0, 0)"
  },
  "editImage": {
    "height": 29,
    "top": 50.288
  }
}
```

Current status:
- The static renderer no longer keeps the bordered cell at the same height as the image.
- The header editor now renders table-level `tblBorders` as visible cell borders.
- The logo content top aligns between static and edit mode within measurement noise (`50.3px` vs `50.288px`).
- ProseMirror's native table layout still reports a slightly taller table box (`33.588px`) than the static renderer (`31px`), so if we chase exact box-height parity next, we should compare against Word/PDF before copying ProseMirror's extra table layout space.

Final image-gap refinement:
- The visible-border PDF showed the logo is not glued to the top border. That vertical breathing room is part of why Word does not clip the image.
- Static Eigenpal still had a small image overhang after the row-height fix:

```json
{
  "before": {
    "cell": { "top": 48, "height": 31, "bottom": 79 },
    "image": { "top": 50.3, "height": 29, "bottom": 79.3, "display": "inline" },
    "gaps": { "top": 2.3, "bottom": -0.3 }
  }
}
```

Root cause:
- Static layout images in table cells were still rendered as inline images.
- The browser inline baseline/vertical-align behavior created a fractional overhang below the paragraph box.
- Since the table cell clips overflow, that fractional overhang could still cut the lower part of the logo.

Patch shape:
- Scope the fix to static header/footer table cells only:

```css
.layout-page-header .layout-table-cell img.layout-run-image,
.layout-page-footer .layout-table-cell img.layout-run-image {
  display: block !important;
}
```

- This does not change table width, borders, or header positioning.
- It removes baseline participation for image runs inside static header/footer table cells, matching the way the header editor already measures the image top.

Verification after Vite restart:

```json
{
  "after": {
    "cell": { "top": 48, "height": 31, "bottom": 79 },
    "image": { "top": 49, "height": 29, "bottom": 78, "display": "block" },
    "gaps": { "top": 1, "bottom": 1 }
  }
}
```

Conclusion:
- The header table issue is now understood as three separate generic renderer gaps:
  - header/footer static renderer originally skipped tables;
  - ProseMirror cell border CSS did not handle DOCX table-level `auto` borders;
  - static table-cell images were inline and could overhang/clip inside bordered cells.
- The current lab fix avoids hardcoded template offsets and keeps the correction tied to DOCX/table rendering semantics.

## Header editor parity with static render

User goal:
- After the static header render matched Word/PDF, the header editor should look the same as the static render.
- The static render is now the reference, not the editor.

Evidence before parity refinement:

```json
{
  "static": {
    "tableHeight": 31,
    "rightCellParagraphHeights": [11.387, 11.387],
    "redLineTop": 87
  },
  "editorBefore": {
    "tableHeight": 33.588,
    "rightCellParagraphHeights": [14.663, 14.663],
    "redLineTop": 89.588
  }
}
```

Root cause:
- The editor table cells already had correct borders and correct span font sizes.
- But the ProseMirror paragraph elements inside the table cells still had a parent paragraph `font-size` of `14.6667px`.
- Even with `line-height: 0`, that parent font strut made each table-cell paragraph taller than the static DOCX layout.
- The extra paragraph height made the native HTML table taller and pushed the red separator line down.

Patch shape:
- Keep the fix scoped to the header/footer ProseMirror editor table cells.
- For paragraphs inside header/footer editor table cells that contain image/span runs, remove the parent paragraph font strut:

```css
.hf-editor-pm .ProseMirror td p:has(img),
.hf-editor-pm .ProseMirror th p:has(img),
.hf-editor-pm .ProseMirror td p:has(span),
.hf-editor-pm .ProseMirror th p:has(span) {
  font-size: 0 !important;
  line-height: 0 !important;
}
```

- The actual text remains visible because the nested run spans keep their DOCX-derived font size and line height.
- This is a generic editor rendering correction for table-cell run layout, not a document-specific offset.

Verification after Vite restart:

```json
{
  "static": {
    "tableHeight": 31,
    "rightCellParagraphHeights": [11.387, 11.387],
    "redLineTop": 87
  },
  "editorAfter": {
    "tableHeight": 30.6,
    "rightCellParagraphHeights": [11.538, 11.538],
    "redLineTop": 86.6
  },
  "delta": {
    "tableHeight": -0.4,
    "redLineTop": -0.4
  }
}
```

Follow-up parity refinement:
> Superseded: this was an intermediate Golden-lab observation. The final source
> patch uses `border-collapse: collapse` after the later doubled-divider
> regression showed `separate` no longer matched the desired editor/render
> parity. See the 2026-04-30 final interaction notes below.

- The static renderer uses absolutely sized border-box cells; the ProseMirror editor uses a native HTML table.
- With `border-collapse: collapse`, the editor places shared borders differently from the static renderer, causing the vertical divider to appear about half a border width to the right.
- Scope the editor header/footer tables to the same border-box geometry model:

```css
.hf-editor-pm .ProseMirror table {
  border-collapse: separate !important;
  border-spacing: 0 !important;
}

.hf-editor-pm .ProseMirror td.docx-table-cell,
.hf-editor-pm .ProseMirror th.docx-table-header {
  box-sizing: border-box !important;
}

.hf-editor-pm .ProseMirror tr > * + * {
  border-left: none !important;
}
```

- After removing the parent paragraph font strut, text leaf spans need the normal inline glyph leading restored.
- Apply this only to the leaf text span inside header/footer editor table cells, so wrapper spans do not accumulate the offset:

```css
.hf-editor-pm .ProseMirror td p span:not(:has(> span)),
.hf-editor-pm .ProseMirror th p span:not(:has(> span)) {
  position: relative;
  top: .2em;
}
```

Final measured parity after Vite restart:

```json
{
  "table": {
    "static": { "left": 96, "top": 48, "width": 601.725, "height": 31 },
    "editor": { "left": 96, "top": 48, "width": 602, "height": 30.6 }
  },
  "rightCell": {
    "staticLeft": 376,
    "editorLeft": 376
  },
  "textLeafDeltas": [
    { "text": "CÓDIGO ...", "topDelta": -0.086, "leftDelta": -0.525 },
    { "text": "ÁREA ...", "topDelta": 0.067, "leftDelta": -0.525 }
  ]
}
```

Conclusion:
- The division between cells now aligns exactly in DOM geometry (`left: 376px` in static and edit mode).
- The right-cell text vertical alignment is within subpixel tolerance (`< 0.1px`) between static render and edit mode.
- The remaining horizontal text difference is about `0.5px`; the cell and table geometry are aligned, so this is browser inline text measurement/antialiasing noise, not a DOCX table layout mismatch.
- Do not add a template-specific offset for this.

## Header page field formatting

User observation:
- In header edit mode, inserted page fields can be styled just like vanilla Eigenpal.
- After leaving header edit mode, the rendered header resolves the field value correctly, but the field value loses formatting.

Focused fixture:
- `public/fixtures/dc-template-descricao-cargo-word-borders-page-fields.docx`
- This fixture keeps the same header table and replaces literal `1 de 2` with real `PAGE` and `NUMPAGES` fields inside the right cell.

Editor-mode evidence before static-render fix:

```json
{
  "docx-field-page": {
    "text": "1",
    "fontSize": "9.33333px",
    "lineHeight": "normal",
    "color": "rgb(90, 90, 90)"
  },
  "docx-field-numpages": {
    "text": "2",
    "fontSize": "9.33333px",
    "lineHeight": "normal",
    "color": "rgb(90, 90, 90)"
  }
}
```

Static-render evidence before the fix:

```json
{
  "neighborText": {
    "text": "PAGINA",
    "fontSize": "6.66667px",
    "color": "rgb(90, 90, 90)"
  },
  "pageFieldValue": {
    "text": "1",
    "fontSize": "14.6667px",
    "color": "rgb(0, 0, 0)"
  },
  "numPagesFieldValue": {
    "text": "4",
    "fontSize": "14.6667px",
    "color": "rgb(0, 0, 0)"
  }
}
```

Root cause:
- The editor is correct: the ProseMirror `field` node is inline/atom and supports marks.
- The static renderer resolves field values through the ProseMirror-to-layout conversion path.
- In that conversion, text and tab nodes copied marks with `...is(node.marks, theme)`.
- Field nodes did not copy marks, so the resolved `PAGE` / `NUMPAGES` layout runs fell back to the default document font and color.

Patch shape:
- In the ProseMirror-to-layout conversion, include `...is(a.marks, theme)` when creating layout runs for `field` nodes.
- This mirrors existing text/tab behavior and is generic for all fields, not only page numbering or this template.
- The fix belongs in render conversion, not CSS, because the editor DOM already has the correct formatting.

Verification after restarting Vite with `--force`:

```json
[
  {
    "text": "PAGINA",
    "fontSize": "9.33333px",
    "color": "rgb(90, 90, 90)"
  },
  {
    "text": "1",
    "fontSize": "9.33333px",
    "color": "rgb(90, 90, 90)"
  },
  {
    "text": "de",
    "fontSize": "9.33333px",
    "color": "rgb(90, 90, 90)"
  },
  {
    "text": "4",
    "fontSize": "9.33333px",
    "color": "rgb(90, 90, 90)"
  }
]
```

Conclusion:
- The page-number field formatting bug is a static-render conversion bug.
- The correct durable fix is to preserve marks on field atoms when converting to layout runs.
- CSS should not be used to solve this field formatting issue.

Verification note:
- `npm.cmd run build` currently fails on pre-existing unrelated TypeScript issues:
  - `src/pages/T9Stress.tsx`: unused `users`.
  - `src/plugins/metadata-header/index.tsx` and `StatusBadge.tsx`: missing `JSX` namespace.
- The Eigenpal lab patch itself is idempotent: `npm.cmd run patch:eigenpal` returns `already-patched` after the first application.

## Simple Header Table Insert Width

Scenario:
- Header content was replaced with an empty paragraph, one table with two columns, and an empty paragraph.
- This reproduced a more general issue than the original imported Metal Nobre header.

Observed before the final table-view fix:

```json
{
  "model": {
    "width": { "value": 5000, "type": "pct" },
    "cellWidths": [
      { "value": 50, "type": "pct" },
      { "value": 50, "type": "pct" }
    ]
  },
  "staticRender": {
    "headerWidth": 602,
    "tableWidth": 602,
    "cellWidth": 301
  },
  "editorRender": {
    "tableStyle": "--default-cell-min-width: 100px; min-width: 200px;",
    "tableWidth": 200,
    "cellWidth": 100
  }
}
```

Root causes:
- New top-level tables were previously created with a hard-coded `9360 dxa` width. In this document the header content width is about `602px`, while `9360 dxa` renders as about `624px`, so the table could be born outside the header limits.
- Changing top-level inserted tables to `widthType="pct"` / `width=5000` fixes the model and the static renderer.
- The editor still rendered the percent table as `200px` because `prosemirror-tables` `TableView` ignores `node.attrs.width` / `node.attrs.widthType` when cells do not have pixel `colwidth`. It falls back to `defaultCellMinWidth * columnCount`.
- Empty cells without explicit `tcMar` also differed: ProseMirror used `padding: 7px` on all sides, while the static/Word-like renderer used `padding: 0px 7px`.

Patch shape:
- Insert top-level tables as `width=5000`, `widthType="pct"`, with percent cell widths. Nested tables still use the parent cell width in `dxa`.
- Change default editor cell padding for cells without explicit margins to `0px 7px`.
- Patch `prosemirror-tables` `updateColumnsOnResize` so it respects table-level `widthType`:
  - `pct`: set table width to `width / 50 + "%"` and keep min width as the resize safety floor.
  - `dxa`: set table width to the dxa-to-px conversion.
  - fixed `colwidth`: keep existing behavior.

Verification after the table-view fix, using `fixture=simple-header-pct`:

```json
{
  "model": {
    "width": { "value": 5000, "type": "pct" },
    "cellWidths": [
      { "value": 2500, "type": "pct" },
      { "value": 2500, "type": "pct" }
    ]
  },
  "staticRender": {
    "headerWidth": 602,
    "tableWidth": 601.725,
    "cellWidth": 300.863,
    "cellPadding": "0px 7px",
    "rowHeight": 24
  },
  "editorRender": {
    "tableStyle": "--default-cell-min-width: 100px; width: 100%; min-width: 200px;",
    "tableWidth": 602,
    "cellWidth": 301,
    "cellPadding": "0px 7px",
    "rowHeight": 24
  }
}
```

Conclusion:
- This is not a document-specific fix.
- The general rule is: the model owns table width semantics, static render consumes them, and the ProseMirror table view must honor the same semantics while editing.
- CSS-only fixes would hide the symptom but not fix the editor table view's width decision.

## Empty Paragraph Before Newly Inserted Header Table

Scenario:
- User clears the header content.
- ProseMirror leaves an empty paragraph as the editable placeholder.
- User inserts a table.

Observed before the fix:
- The insert-table command inserted the table after the current empty paragraph.
- That left a real empty paragraph above the table.
- The cursor could be placed and text could be typed above the table, even though the user's intent was for the table to be the first header component.

Root cause:
- The command computed the insert position with `after(paragraph)` whenever the selection was inside a paragraph.
- It did not distinguish an empty placeholder paragraph from a meaningful paragraph.

Patch shape:
- If the selection is inside an empty paragraph (`content.size === 0`), replace that paragraph with the inserted table sequence.
- Otherwise keep the old behavior and insert after the current paragraph/table.
- This preserves imported documents that intentionally contain a paragraph before a table.

Verification:

```json
{
  "headerBlockTypes": ["table", "paragraph"],
  "firstHeaderBlockType": "table",
  "paragraphBeforeTable": null,
  "editorTable": {
    "top": 48,
    "width": 602,
    "height": 24
  }
}
```

Conclusion:
- The cursor above the table was caused by a real model node, not a visual CSS artifact.
- The durable fix is to consume the editor placeholder paragraph when inserting the first table.
- Keeping a paragraph after the table is still useful because it gives ProseMirror a valid editable position after the table.

## Percent Table Column Resize

Scenario:
- New top-level tables are inserted as `width=5000`, `widthType="pct"` so they respect the current page/header content width.
- ProseMirror column resize writes pixel widths into `cell.attrs.colwidth`, but only for the column being resized.
- The untouched columns can remain percentage-based.

Observed problem:
- The resize handle could move and ProseMirror could update part of the table metadata.
- Static/layout rendering could still look unchanged because the conversion discarded partial `colwidth` arrays unless every column had an explicit width.

Root cause:
- Vanilla ProseMirror table resizing supports partial `colwidth`.
- Eigenpal's layout bridge expected a complete `columnWidths` array.
- Our percent-table insertion made that mismatch visible because new tables start without pixel column widths.

Patch shape:
- Preserve partial `colwidth` arrays during ProseMirror-to-layout conversion instead of dropping them.
- During table measurement, complete missing columns from the table's real target width (`pct`/`dxa`/content width).
- Distribute the remaining width proportionally using the original cell widths where available.
- Keep this in render/layout normalization, not CSS, and do not hardcode this document's table width.

Conclusion:
- This is a general bridge fix between ProseMirror's native resize metadata and Eigenpal's layout/export model.
- It avoids reverting the percent-width table insertion fix that made new header/body tables respect page limits.

## Inserted Body Table Resize Reassessment

Date: `2026-04-28`

Re-test after the user reported that body table resize still did not work:
- The earlier bridge fix was real, but it was not the whole story for newly inserted top-level tables.
- Fresh evidence from `/t10?fixture=page-fields` showed the new body table was still being born in the wrong model shape in the failing path.

Observed before the reassessment:

```json
{
  "tableModel": {
    "width": { "value": 5000, "type": "pct" },
    "cellWidths": [
      { "value": 50, "type": "pct" },
      { "value": 50, "type": "pct" }
    ]
  },
  "editorDom": {
    "tableStyle": "--default-cell-min-width: 100px; width: 100%; min-width: 200px;",
    "colStyles": ["", ""]
  }
}
```

What that meant:
- The previous fix improved layout/export handling once `colwidth` existed.
- But in this insertion path the new top-level table still had no pixel `colwidth` baseline.
- So we were fixing the bridge too late in the pipeline.

Updated source-patch conclusion:
- The Golden lab temporarily explored creating fresh top-level tables as `dxa`, because imported DOCX tables often arrive with concrete grid metadata.
- The professional source patch keeps top-level inserted tables as `width=5000`, `widthType="pct"` because that model fits body, header, and footer content boxes without needing page-width assumptions.
- The root problem was not the percent table model itself; it was that column commands only assigned the new percentage width to the inserted cell and left existing cells at their previous percentages.
- Example bug: `50% / 50%` plus `addColumnRight` became `50% / 33% / 50%`.

Final patch shape:
- Top-level inserted tables remain percent tables.
- `addColumnLeft`, `addColumnRight`, and `deleteColumn` now redistribute `pct` cell widths across the full table width after the command.
- `dxa` tables continue to use the fixed-width grid path.
- Non-fixed stale `tblGrid` metadata is still cleared so percent/auto tables do not export obsolete fixed grids.

Verification:
```text
addColumnRight: 50 / 50 -> 33 / 33 / 34
addColumnLeft:  50 / 50 -> 33 / 33 / 34
deleteColumn:   33 / 33 / 34 -> 50 / 50
```

Conclusion:
- The durable fix is to preserve the percent table model for newly inserted top-level tables and normalize percentage cell widths at the same command boundary where fixed tables normalize `colwidth`.
- This keeps body/header/footer insertion general and avoids hardcoding document-specific widths.

## Header Table Interaction Parity

Date: `2026-04-28`

Focused scope:
- Header tables now render and persist correctly.
- The remaining gap is editor interaction parity between body tables and header/footer tables.

User-visible difference still under investigation:
- In the body, table cells behave like full table cells: selection is clearer, resize affordances are visible, divider drag preserves overall table width, and table context actions behave normally.
- In the header editor, table controls can now appear in the toolbar, but the table still behaves differently: weaker cell interaction, no normal table context menu, and divider drag can still feel like it changes the table width instead of only the column split.

Structural findings from the bundle:
- The header/footer editor is not the same surface as the main paged body editor. It is a separate inline component (`rf`) with its own `EditorView`.
- That inline editor builds a fresh extension manager with `new no(sr())`, parses header content with `vl(...)`, and mounts an isolated ProseMirror instance inside `.hf-editor-pm`.
- The body editor has additional app-level integration around the active editor view, table context, and action routing.

Important code-level evidence:
- `sr()` does include the ProseMirror table extensions, including `columnResizing(...)`, `tableEditing()`, and the `activeCell` decoration plugin.
- The inline header editor does not pass a rich table-aware selection payload upward. Its local `dispatchTransaction(...)` calls `lr(state)`, which only extracts text and paragraph formatting.
- `lr(...)` does not include table context.
- The richer table extractor used elsewhere is `Ge(state)`, which returns `isInTable`, row/column indexes, selection shape, and related table metadata.

What that means:
- The header editor is no longer "table blind", because we already patched enough for toolbar table options to appear.
- But it is still not wired into the same table interaction contract as the main paged editor.
- So we currently have partial parity:
  - table schema/plugins exist;
  - table toolbar visibility can exist;
  - but header selection/context integration is still shallower than the body path.

Concrete implications:
- Missing or reduced table context in header edit explains why right-click or cell-context behavior can diverge from the body.
- If resize behavior still differs in header, that is likely a second layer:
  - either the inline header editor is not using the same insert/normalize path as the body editor,
  - or the header table is still bypassing some width-normalization step after raw ProseMirror resize metadata changes.

Senior-engineering interpretation:
- This is not a CSS-only problem.
- It is also not a Word-template-specific problem.
- It is an architectural mismatch between:
  - the generic inline header/footer ProseMirror editor, and
  - the richer paged editor table interaction stack used by the body.

Next investigation step:
- Compare the header inline editor action/selection bridge against the main paged editor table bridge.
- Specifically verify whether header mode should also expose `Ge(state)`-level table context, and whether inserted header tables pass through the same width-normalization lifecycle as body tables.

## Header Inline Context Bridge

Date: `2026-04-28`

What the deeper investigation confirmed:
- The remaining header-table bug is not the old render/layout bug.
- It is an interaction-bridge bug between the inline header editor and the shell that owns table context menus and actions.

Root cause:
- The shared shell context-menu callback `cg(...)` still resolved context from `Oe.current?.getView()`, which is the body editor view.
- The inline header/footer editor `rf` had no dedicated `onContextMenu` bridge into that shared callback.
- So even after header table toolbar state started to appear, right-click/context-sensitive table behavior could still be computed from the body selection instead of the active header selection.

Patch shape applied in the lab:
- Make `cg(...)` resolve the active editor view through `I()` instead of hardcoding `Oe.current`.
- Pass `onContextMenu:cg` into the inline header/footer editor mount.
- Add an inline header editor context-menu bridge on `.hf-inline-editor` that forwards:
  - pointer position
  - whether the inline selection is collapsed

Why this is a senior/professional fix:
- It does not hardcode anything about this template.
- It does not fake table state with CSS.
- It fixes the editor-shell contract so header context-aware actions use the active editor view, the same architectural rule already used elsewhere by toolbar actions.

What this patch is expected to improve:
- right-click table actions in header edit mode
- any shell action that depends on table context coming from the currently active view

What it does not claim by itself:
- full parity of every table affordance between header and body
- complete convergence of all hover/resize UX, which may still depend on separate inline-editor limitations

## Fixed-Width Header Table Commands

Date: `2026-04-28`

Problem isolated with browser TDD:
- Header table resize was already fixed to preserve the total table width.
- But `Insert column right` from the header context menu still overflowed the page.
- Repro before the fix:

```json
{
  "before": [280, 322],
  "after": [280, 280, 322],
  "beforeTotal": 602,
  "afterTotal": 882,
  "preserved": false
}
```

Root cause:
- The context-menu command does not only use native `prosemirror-tables` `addColumn`.
- Eigenpal has its own table command layer (`u`/`c`) that inserts cells and then rewrites table widths.
- That layer treated inserted columns like generic percent-width table columns, which is wrong for imported DOCX fixed-width tables.
- A separate model helper (`Gu`) also duplicated the inserted column width without preserving the original total.

Correct semantic rule:
- If a table already has a fixed column grid (`columnWidths` or complete `colwidth`), inserting a column must preserve the existing total table width.
- The new column receives a width based on the selected/source column.
- All columns are then normalized proportionally back to the original total.
- Cell attrs are updated with `width`, `widthType: "dxa"`, and `colwidth` so ProseMirror, layout, and DOCX serialization stay aligned.

Patch shape applied in the lab:
- `Gu(...)` model insert-column now scales `columnWidths` after inserting a new width.
- Eigenpal ProseMirror table commands now call `MD_LAB_normalizeInsertedTableColumns(...)` after `addColumnLeft` / `addColumnRight`.
- Native `prosemirror-tables` resize logic still preserves adjacent column width for fixed grids.

Browser validation after the fix:

```json
{
  "before": [280, 322],
  "after": [191, 191, 220],
  "beforeTotal": 602,
  "afterTotal": 602,
  "preserved": true
}
```

Regression checks:

```json
{
  "resize": {
    "before": [280, 322],
    "after": [328, 274],
    "beforeTotal": 602,
    "afterTotal": 602,
    "preserved": true
  },
  "hoverHandleCount": 1,
  "menu": {
    "insertColumnRight": 1,
    "deleteColumn": 1
  },
  "selection": {
    "selectedCellCount": 2
  }
}
```

Senior-engineering conclusion:
- This is not a CSS fix and not template-specific.
- The root issue is a DOCX fixed-table semantic mismatch across three layers:
  - Eigenpal table model commands,
  - Eigenpal ProseMirror table commands,
  - native `prosemirror-tables` column resize behavior.
- The lab patch proves the rule, but production should move this into source/fork-level table command code rather than long string replacements in minified bundles.

## Table Command Regression Suite

Date: `2026-04-28`

Reason for this pass:
- After fixing header fixed-width insert/resize, we needed to prove the patch did not regress body tables.
- The lab debug panel was improved to report table model widths and rendered layout widths instead of relying on screenshots only.

Header validation:

```json
{
  "editHeader": {
    "tableWidth": 602,
    "columns": [280, 322],
    "activeCell": true
  }
}
```

Body baseline:

```json
{
  "model": {
    "columnWidths": [2800, 6226],
    "columnTotal": 9026
  },
  "layout": {
    "width": 602,
    "columns": [187, 415]
  }
}
```

Body insert-column validation:

```json
{
  "model": {
    "columnWidths": [1650, 3691, 3691],
    "columnTotal": 9032
  },
  "layout": {
    "width": 602,
    "columns": [110, 246, 246]
  }
}
```

Body insert-then-delete validation:

```json
{
  "model": {
    "columnWidths": [2806, 6227],
    "columnTotal": 9033
  },
  "layout": {
    "width": 602,
    "columns": [187, 415]
  }
}
```

Interpretation:
- Body table layout remains fixed at `602px`; no overflow was observed.
- The model total changes by `6-7 dxa` after command round-trips. This is a harmless rounding artifact at sub-pixel scale, but worth keeping visible in future tests.
- Header edit mode still exposes the table as a real ProseMirror table with an active cell and the correct fixed layout width.

Remaining caution:
- The current lab proof is strong for fixed-grid width preservation.
- It does not yet fully automate every hover/selection affordance in header mode.
- Productionization should convert the lab monkey patches into a source-level Eigenpal fork or adapter patch with unit coverage around fixed-grid insert, delete, and resize.

## Header Table Interaction Parity Fix

Date: `2026-04-28`

Root cause:
- Header/footer inline editing creates its own ProseMirror `EditorView`, and it does load `prosemirror-tables`.
- The body has additional layout/interaction affordances around the main editor, while the header inline editor only had the raw ProseMirror view.
- The native header states existed (`activeCell`, `selectedCell`, `column-resize-handle`), but the visual CSS was scoped to `.prosemirror-editor .ProseMirror`, so header mode could enter those states without showing the same UI feedback.
- Double-click cell selection is not provided by the raw header inline editor path, while the body interaction layer provides a body-like selection behavior.

Fix proved in the lab:
- Scope the existing table interaction visuals to `.hf-editor-pm .ProseMirror`.
- Add a minimal header inline editor bridge that converts double-click inside `td/th` into a native `prosemirror-tables` `CellSelection`.

Browser validation:

```json
{
  "afterEnterHeader": {
    "tables": 1,
    "headerCells": 2,
    "activeCell": 1,
    "selectedCell": 0,
    "resizeHandle": 0
  },
  "afterHoverDivider": {
    "resizeHandle": 1,
    "resizeCursor": 1,
    "activeCell": 1
  },
  "afterDoubleClickCell": {
    "selectedCell": 1,
    "activeCell": 0,
    "resizeHandle": 1
  }
}
```

Interpretation:
- This is not a table-render workaround. It exposes and uses the native ProseMirror table state that was already present in header mode.
- The only behavior bridge is the double-click gesture, because the body gets that behavior from its higher-level interaction layer and the header inline editor does not.

## Body Table Split: Header-Only Fragment

Date: `2026-04-28`

User-visible bug:
- Page 4 showed the competencies table header twice.
- DOM confirmed two table fragments:
  - first fragment: only `COMPETÊNCIA / NÍVEL ESPERADO`;
  - second fragment: repeated header plus the body rows.

Root cause:
- The table paginator allowed the first fragment of a table to contain only the first row when no row fit in the remaining page space.
- For tables whose first row is marked as a repeated header, this produced a header-only fragment.
- `addFragment(...)` then moved that header-only fragment to the next page, and the next continuation fragment repeated the header again.

Fix proved in the lab:
- When a table starts with header rows and there is at least one body row, the first fragment must fit the header rows plus the first body row.
- If the current page does not have enough remaining space but a fresh page does, force a page break before creating the table fragment.

Browser validation after fix:

```json
{
  "pageCount": 4,
  "page4CompetencyTables": [
    {
      "top": 0,
      "height": 215.075,
      "rows": 6
    }
  ]
}
```

Interpretation:
- The duplicate table title/columns issue is fixed at the pagination source.
- Section 09 still appears at the end of page 3; that is now a separate spacing/pagination parity issue rather than a table-fragment duplication issue.

## Body Pagination: Paragraph `spaceAfter` Fit
Implemented in the isolated lab patch script on `2026-04-28`.

### Symptom
- After fixing the duplicated table header fragment, section `09 COMPETÊNCIAS COMPORTAMENTAIS` still appeared at the bottom of page 3.
- In the Word/PDF reference, page 3 ends after `TREINAMENTOS OBRIGATÓRIOS`, and section 09 starts on page 4.
- The paragraph was not protected by `keepNext`; Word can move section 09 upward if earlier content is deleted.

### Evidence
- Browser layout before this fix:
  - section 08 table ended at `837.65px` in the page content area.
  - section 09 started at `861.65px`, because its `spaceBefore` is `24px`.
  - section 09 visual paragraph height was `31.775px`.
  - content area bottom is about `897px`, so the visual paragraph ended at `893.425px`, leaving only about `3.6px`.
- DOCX XML for the numbered section headings includes:
  - `w:spacing w:before="360"` -> `24px`
  - `w:spacing w:after="120"` -> `8px`
  - bottom paragraph border spacing/width already included by the earlier border-box fix.
- Counting the paragraph's own `spaceAfter`, section 09 needs about `24 + 31.775 + 8 = 63.775px`.
- Only about `59.35px` was available at the end of page 3, so Word moves the paragraph to page 4.

### Root Cause
- Eigenpal stores paragraph `spaceAfter` as trailing spacing and applies it lazily before the next block.
- If the paragraph itself visually fits but its trailing spacing does not, the paginator allowed the paragraph at the bottom of the page.
- When the following table did not fit, the table moved to the next page and the paragraph's trailing spacing was effectively dropped at the page break.
- Word treats the paragraph's own `spaceAfter` as part of the fit decision in this case, so it moves the paragraph instead of leaving an orphaned heading at the bottom.

### Fix Shape
- Add a generic paragraph-fit guard in `layoutParagraph`.
- Before adding the final fragment of a paragraph with `spaceAfter`, check whether:
  - `spaceBefore + paragraphHeight + spaceAfter` fits on a fresh page.
  - the same amount does not fit in the remaining space of the current page.
  - the current page already has content.
- If so, force a page break before placing the paragraph.
- This is not tied to section 09, headings, tables, or the Metal template; it fixes the pagination semantics around paragraph trailing spacing.

### Browser Validation
After forced Vite dependency re-optimization:

```json
{
  "page3LastBlocks": [
    "08 REQUISITOS DO CARGO",
    "ESCOLARIDADE MÍNIMA ... TREINAMENTOS OBRIGATÓRIOS"
  ],
  "page4FirstBlocks": [
    "09 COMPETÊNCIAS COMPORTAMENTAIS",
    "COMPETÊNCIANÍVEL ESPERADO",
    "10 DIRETRIZES CRÍTICAS E RISCOS DO CARGO"
  ]
}
```

The duplicate competency-table header fragment remains fixed, and section 09 now starts on page 4 like the Word/PDF reference.

## Package C Source Patch Progress (2026-04-29)

### Applied now (upstream-source)
- File: `packages/core/src/layout-engine/index.ts`
- `BODY-03`: Added first-fragment guard for header-repeat tables to avoid creating a first fragment with only header rows when `header + first body row` can fit on a fresh page.
- `BODY-04`: Added final-paragraph fit guard so `spaceAfter` participates in page-break decision when paragraph text alone fits but full box (`spaceBefore + text + spaceAfter`) does not.

### Notes
- Changes are structural and generic (not template-specific), implemented in pagination decision points before fragment placement.
- Local automated tests could not run here because repo test scripts depend on `bun` and `bun` is not installed in this environment.
- Subagent code review requested as mandatory gate before closing this package step.

### Package C review hardening (2026-04-29)
- Ajuste aplicado ap�s code review:
  - BODY-04 n�o for�a quebra quando o pr�ximo bloco j� for�a quebra (`nextForcesBreak`), evitando dupla quebra/p�gina extra.
  - BODY-03/BODY-04 deixaram de usar `forcePageBreak()` direto e passaram a usar `ensureFits(...)` para respeitar fluxo de coluna antes de p�gina.
- Arquivo: `packages/core/src/layout-engine/index.ts`

### Package C validation refinement (2026-04-30)
- Validation method corrected: Package C must be checked page-by-page against Golden/PDF visual anchors, not only by DOM/debug JSON or by jumping straight to Section 09.
- BODY-01 refined after visual comparison:
  - preserve authored `spaceBefore` for the first body content on page 1 (`DESCRICAO DE CARGO` remains correctly lowered);
  - suppress leading `spaceBefore` at later page/column tops, matching Word/Golden behavior for Section 01 at the top of page 2.
- Browser validation on `127.0.0.1:5180/t10?fixture=word-borders&packageC=spacing-top-refined`:
  - `DESCRICAO DE CARGO` keeps the expected large top gap without pressing Enter;
  - `01 MISSAO DO CARGO` no longer has the exaggerated gap below the header separator;
  - Section 05 continues across pages;
  - Section 09 starts on the next page again.

### Package C review follow-up (2026-04-30)
- Code review findings addressed:
  - paragraph border height is now considered during line fitting, not only after fitting lines are selected;
  - empty paragraphs reserve paragraph border height instead of always using `0` layout height;
  - top-of-column spacing suppression now uses the active column region top, covering continuous multi-column sections;
  - internal BODY ticket labels were removed from source comments.
- Focused tests run:
  - `npm.cmd exec --yes bun -- test packages/core/src/layout-engine/paginator.test.ts packages/core/src/layout-engine/integration.test.ts`
  - Result: `38 pass`, `0 fail`.
- Visual browser validation repeated on `127.0.0.1:5180/t10?fixture=word-borders&packageC=review-fix-final`:
  - first body heading keeps Word/PDF-like gap;
  - later page-top heading spacing remains suppressed;
  - section heading border spacing remains visually aligned;
  - Section 05/09 pagination remains consistent with the Golden/PDF reference flow.
- Remaining note: paragraph border grouping (`between` border behavior across adjacent same-border paragraphs) was not exercised by this fixture and should be covered by a dedicated regression test before claiming exhaustive paragraph-border parity.

### Package C body table border-height correction (2026-04-30)

During source validation against the PDF/Golden anchors, `127.0.0.1:5180` still showed `09 COMPETENCIAS COMPORTAMENTAIS` at the bottom of page 3.

Important finding:
- The `spaceAfter` guard itself was not the primary failure in the source build.
- Source page 3 had extra available space because body table rows were measured slightly shorter than their rendered/Word height.
- Example before the correction:
  - Section 08 table ended around `823px` in the page content area.
  - The Golden evidence for the same flow expected the table to end around `837.65px`.
  - This left enough artificial space for Section 09 to fit on page 3.

Root cause:
- Body table measurement in `packages/react/src/paged-editor/PagedEditor.tsx` calculated cell height from `content + padding`.
- The renderer paints table cells as `border-box` and draws vertical borders.
- Those border pixels consume real row height in Word/rendered layout, but were not included in pagination measurement.
- This is a generic table measurement mismatch, not a Section 09-specific issue.

Patch shape:
- Add a small helper in the body table measurement path:
  - first row counts top and bottom border thickness;
  - later rows count the bottom shared edge, matching the existing collapsed-border painter behavior.
- Add a focused regression test in `packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts`.

Focused tests:
```text
npm.cmd exec --yes bun -- test packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts packages/core/src/layout-engine/paginator.test.ts packages/core/src/layout-engine/integration.test.ts

Result: 39 pass, 0 fail.
```

Browser validation:
- URL: `http://127.0.0.1:5180/t10?fixture=word-borders&packageC=table-border-height-fix`
- Page 1: `DESCRICAO DE CARGO` still keeps the authored top gap.
- Page 2: Section 01, Section 02/03/04, and Section 05 remain visually aligned with the PDF/Golden flow.
- Page 3: ends after `TREINAMENTOS OBRIGATORIOS`; Section 09 is no longer orphaned at the bottom.
- Page 4: starts with `09 COMPETENCIAS COMPORTAMENTAIS`.

### Package C review follow-up: shared border measurement (2026-04-30)

A Package C review blocked the body-layout patch until two generic measurement/rendering mismatches were addressed:

- Paragraph borders: layout was adding only explicit `w:space + border width`, while the renderer used Word-like fallback padding when `w:space` was absent. This could still under-measure bordered paragraphs by several pixels.
- Split body tables without repeated header rows: continuation fragments redraw the first visible row's top border, but the paginator did not reserve that fragment-start border height.

Implemented source-level fix:

- Added shared border helpers in `packages/core/src/layout-engine/borders.ts`.
- Paragraph layout now uses the same fallback padding values as the renderer (`top=2px`, `bottom=6px`, left/right `4px`) when border spacing is absent.
- `renderParagraph.ts` now uses the same helper instead of duplicating fallback padding logic inline.
- Table layout now marks continuation fragments without header rows with `startBorderHeight`.
- `renderTable.ts` applies that fragment-start height to the first rendered content row, so pagination measurement and visual row rendering stay aligned.

Validation:

```powershell
bun test packages/core/src/layout-engine/integration.test.ts --test-name-pattern "body layout border fidelity"
# 2 pass, 0 fail

bun test packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts packages/core/src/layout-engine/paginator.test.ts packages/core/src/layout-engine/integration.test.ts
# 41 pass, 0 fail

bun run --filter '@eigenpal/docx-core' typecheck
# exited with code 0
```

Browser validation:

- URL: `http://127.0.0.1:5180/t10?fixture=word-borders&packageC=border-review-fix`
- Fixture loaded successfully.
- Visual check confirms `09 COMPETENCIAS COMPORTAMENTAIS` is on the next page, not orphaned at the bottom of the previous page.

Tooling decision:

- Bun is now installed globally (`bun --version` -> `1.3.13`).
- Use `bun test ...` directly. Do not use `npm exec --yes bun` for normal validation in this lab.

### Package C second review follow-up: continuation rows and grouped paragraph borders (2026-04-30)

A second review blocked the Package C border follow-up until two generic cases were covered:

- Table continuation fragments: `startBorderHeight` was applied to the visible first row box, but not to all fragment-local row-height consumers such as row-span Y positions and row resize handles.
- Grouped paragraph borders: renderer uses `between` as the top border for interior grouped paragraphs, while layout only budgeted explicit `top` and `bottom` borders.

Implemented source-level fix:

- Extended shared border helpers with paragraph border grouping and renderer-equivalent paragraph border-box height calculation.
- Body layout now passes adjacent paragraph borders into paragraph layout so grouped `between` borders are measured before pagination decisions.
- `renderParagraph.ts` now reuses the shared grouping helper instead of keeping a duplicate local grouping implementation.
- `renderTable.ts` now uses a fragment-local `rowHeightInFragment()` helper for row-span Y positions, rendered row height, row resize handles, and bottom edge handles.

Regression coverage added:

- `integration.test.ts`: grouped paragraphs with `between` border reserve renderer-equivalent height.
- `renderTable.test.ts`: continuation table fragment with multiple rows applies `startBorderHeight` to rendered rows and resize handles.

Validation:

```powershell
bun test packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts packages/core/src/layout-engine/paginator.test.ts packages/core/src/layout-engine/integration.test.ts packages/core/src/layout-painter/renderTable.test.ts
# 43 pass, 0 fail

bun run --filter '@eigenpal/docx-core' typecheck
# exited with code 0
```

Browser validation:

- URL: `http://127.0.0.1:5180/t10?fixture=word-borders&packageC=blocker-followup`
- Fixture loaded successfully.
- Visual check confirms `09 COMPETENCIAS COMPORTAMENTAIS` remains on the next page after the review follow-up.

## Package D consolidation triage (2026-04-30)

Package D starts as verification-first consolidation, not remediation. Historical warnings from the Golden/source migration docs must be reproduced in the current source before becoming implementation work.

Current triage results:

- Section 09/body pagination: not reopened. Browser validation on `127.0.0.1:5180/t10?fixture=word-borders&packageD=triage-console-fresh-*` still shows Section 09 starting on the next page.
- Template overlay alignment: not reproduced. Browser validation on `127.0.0.1:5180/t4?fixturePath=/fixtures/dc-template-descricao-cargo-word-borders.docx&packageD=triage-template-overlay` shows header placeholder highlights aligned with visible placeholder text.
- Stale `rowHeightInFragment is not defined` browser console entries were old logs. Fresh reload only reproduced the existing Vite `stream` externalization warning; `bun test packages/core/src/layout-painter/renderTable.test.ts` passed.
- Header/footer-only variable discovery: reproduced and fixed. `getVariables()` returned `0` for `header-placeholder-table.docx` before the patch because `detectVariablesDetailed()` did not traverse `doc.package.headers` / `doc.package.footers`, despite already having `detectVariablesInHeaderFooter()`.

Source fix:

- `packages/core/src/utils/variableDetector.ts` now includes parsed package header/footer parts in the document-level variable result.
- `packages/core/src/utils/__tests__/variableDetector.test.ts` covers variables inside package header table cells and footer paragraphs.

Validation:

```powershell
bun test packages/core/src/utils/__tests__/variableDetector.test.ts packages/core/src/layout-bridge/__tests__/measureHeaderFooter.test.ts packages/core/src/layout-bridge/__tests__/toFlowBlocks-field-formatting.test.ts packages/react/src/plugins/template/components/TemplateHighlightOverlay.test.ts packages/react/src/paged-editor/headerFooterContent.test.ts
# 16 pass, 0 fail

bun run --filter '@eigenpal/docx-core' typecheck
# exited with code 0
```

Browser validation:

- Before: `127.0.0.1:5180/t4?fixturePath=/fixtures/synthetic/header-placeholder-table.docx&packageD=triage-header-only-vars` returned `found 0 template variable(s)`.
- After: `127.0.0.1:5180/t4?fixturePath=/fixtures/synthetic/header-placeholder-table.docx&packageD=header-vars-after-fix-*` returned 4 variables: `controlled_by_area`, `doc_code`, `doc_title`, and `revision_number`.

Package D review follow-up:

- Review found the initial header/footer variable detector patch was too broad because it scanned every parsed package header/footer part, including unreferenced parts.
- Final shape follows DOCX attachment semantics: collect `rId`s from section `headerReferences` / `footerReferences` and `finalSectionProperties`, then scan only those referenced parts once.
- The test now includes referenced and unreferenced header/footer parts, proving unreferenced variables are ignored.
- Local fixture validation for `header-placeholder-table.docx` returned 4 variables split by location: header `controlled_by_area`, `doc_code`, `doc_title`; footer `revision_number`.
- Post-review checks: focused suite `16 pass`, `0 fail`, `50 expect()` calls; direct core typecheck via `node_modules\.bin\tsc.exe --noEmit -p packages\core\tsconfig.json` exited with code 0.

Package D final test hardening:

- Added coverage for `finalSectionProperties`-only header references.
- Added coverage proving repeated references to the same header `rId` are scanned once.
- Final focused validation: `18 pass`, `0 fail`, `55 expect()` calls; direct core typecheck exited with code 0.

## Package D final consolidation result (2026-04-30)

Status: PASS_WITH_MINOR_RISKS for the lab/source consolidation phase.

Automated regression gate:

`powershell
bun.cmd test packages/core/src/layout-bridge/__tests__/measureHeaderFooter.test.ts packages/core/src/layout-bridge/__tests__/toFlowBlocks-field-formatting.test.ts packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/docx/serializer/tableSerializer.test.ts packages/react/src/paged-editor/headerFooterContent.test.ts packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts packages/react/src/plugins/template/components/TemplateHighlightOverlay.test.ts packages/core/src/layout-engine/paginator.test.ts packages/core/src/layout-engine/integration.test.ts packages/core/src/layout-painter/renderTable.test.ts packages/core/src/utils/__tests__/variableDetector.test.ts
# 101 pass, 0 fail, 273 expect() calls
`

Typecheck gate:

`powershell
bun.cmd run --filter '@eigenpal/docx-core' typecheck
# exited with code 0

bun.cmd run --filter '@eigenpal/docx-js-editor' typecheck
# exited with code 0
`

Browser smoke gate on 127.0.0.1:5180:

- T10 golden fixture word-borders: loaded, header table text present, body anchor present, Section 01 present, Section 09 present, no browser error logs.
- T4 real template fixture: found 7 variables, header/footer overlay debug includes doc_code,
evision_number, controlled_by_area, no browser error logs.
- T4 synthetic header-placeholder-table.docx: found 4 variables (doc_code, doc_title, controlled_by_area,
evision_number), no browser error logs.

Final implementation audit:

- Verdict: PASS_WITH_MINOR_RISKS.
- No CRITICAL or MAJOR blockers in source diff 69f5ab0..HEAD.
- Minor risk 1: measureHeaderFooter() still under-models some rendered header/footer table cases for external/core-only consumers; validated React paged-editor path is not blocked.
- Minor risk 2: unmapped header/footer template overlay fallback still assumes placeholders fit inside one rendered text span; validated fixtures are not blocked, but split-run placeholders should become a future focused regression if needed.

Decision for this phase:

- Package D can be considered consolidated for the validated lab/source path.
- Do not integrate into Metal Docs yet; keep this as the professional EigenPal source patch package until explicit consolidation/adoption planning.

## Header editor round-trip spacing stability
Implemented in the professional source patch on `2026-04-30`.

After Package D validation, `public/fixtures/synthetic/header-placeholder-table.docx` exposed a remaining header-table lifecycle bug:
- initial static header table rendered at `height: 49.4348px`
- opening the inline header editor and leaving it without an intentional table resize changed the static table to `height: 61.5945px`
- table width stayed stable at `566px`, so the issue was row/content height, not width or column sizing

Root cause:
- `headerFooterToProseDoc(...)` resolves style defaults so ProseMirror can render text correctly.
- For imported paragraphs with no explicit `w:pPr`, the PM attrs included inherited defaults such as `spaceAfter: 160`, `lineSpacing: 259`, and `lineSpacingRule: "auto"`.
- On `proseDocToBlocks(...)`, those inherited values were serialized back as explicit paragraph formatting.
- In header table cells, this materialized spacing increased row height after a no-op editor round-trip.

Patch shape:
- imported paragraphs now keep an explicit empty `_originalFormatting` marker when the DOCX paragraph had no formatting.
- imported paragraphs also keep `_resolvedFormatting`, the style-resolved baseline used by the editor for visual rendering.
- `fromProseDoc` continues to use `_originalFormatting` as the lossless serialization base, but compares editable attrs against `_resolvedFormatting` when the original DOCX had no explicit value.
- Internal ProseMirror defaults such as `hangingIndent: false` are normalized back to absence, so they do not become artificial DOCX paragraph formatting after a no-op edit.
- This preserves the distinction between "style-resolved for editor rendering" and "explicit formatting to save".
- Review follow-up: the first empty-marker patch prevented no-op inflation, but could drop real user edits on originally unformatted paragraphs. The final patch fixes both sides: no-op inherited defaults are not serialized, while intentional editor changes are preserved across the serializable paragraph attrs exposed by ProseMirror.
- No header-specific CSS or fixture-specific sizing rule was added.

Regression coverage:
- Added `headerFooterToProseDoc - table sizing metadata > does not materialize inherited paragraph spacing during header table round-trip`.
- Added `headerFooterToProseDoc - table sizing metadata > preserves user-applied spacing on originally unformatted header table paragraphs`.
- Added `headerFooterToProseDoc - table sizing metadata > preserves user-applied paragraph borders on originally unformatted header table paragraphs`.
- Added `headerFooterToProseDoc - table sizing metadata > preserves clearing inherited hanging indent on originally unformatted header paragraphs`.
- Browser validation on `http://127.0.0.1:5180/t4?fixturePath=/fixtures/synthetic/header-placeholder-table.docx`:
  - before entering header: `height: 49.4348px`
  - after entering and leaving header: `height: 49.4348px`

Verification:
```text
bun.cmd test packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/layout-bridge/__tests__/measureHeaderFooter.test.ts packages/react/src/paged-editor/headerFooterContent.test.ts packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts
# 31 pass, 0 fail, 84 expect() calls

bun.cmd run --filter '@eigenpal/docx-core' typecheck
# Exited with code 0

bun.cmd run --filter '@eigenpal/docx-js-editor' typecheck
# Exited with code 0
```

## Header table cell-selection parity follow-up

Implemented in the professional source patch on `2026-04-30`.

Context:
- After Package D, header tables could render and resize, but the synthetic header table still needed one final interaction check against the Golden behavior.
- The body editor receives table-cell interaction from the main ProseMirror editor surface. Header/footer uses an independent inline `EditorView`, so it needs a small bridge for the body-like double-click cell-selection gesture.

Source-level implementation:
- File: `analysis/eigenpal-upstream-source/packages/react/src/components/InlineHeaderFooterEditor.tsx`
- The header/footer inline editor now converts a double-click inside `td/th` into a native `prosemirror-tables` `CellSelection`.
- The bridge uses candidate ProseMirror cell positions from `view.posAtDOM(cell, 0)` plus the resolved table-cell boundary when available.
- The final dispatch uses `CellSelection.create(view.state.doc, cellPos)`, matching ProseMirror's single-cell selection API and the Golden behavior.
- The event is handled on normal `onDoubleClick`, not capture, so it does not fight the table resize plugin's pointer/hover lifecycle.

Important interaction distinction:
- Hovering the cell divider is the resize path and should show `column-resize-handle` / `resize-cursor`.
- Double-clicking inside the cell content area is the selection path and should show `.selectedCell`.
- A double-click exactly on/near the divider remains resize-oriented; this is expected and avoids overloading the same pixels with two competing interactions.

Browser validation on `127.0.0.1:5180`:

URL:
`/t10?fixturePath=/fixtures/synthetic/header-placeholder-table.docx&selectionfix=on-double-click-native-20260430`

```json
{
  "entered": {
    "hfEditors": 1,
    "hfTables": 1,
    "activeCells": 1,
    "selectedCells": 0,
    "resizeHandles": 0
  },
  "afterHoverDivider": {
    "activeCells": 0,
    "selectedCells": 0,
    "resizeHandles": 1,
    "resizeCursor": 1
  },
  "afterDoubleClickInsideCell": {
    "activeCells": 0,
    "selectedCells": 1,
    "resizeHandles": 0,
    "resizeCursor": 0
  }
}
```

Automated verification:

```powershell
bun test packages/react/src/components/InlineHeaderFooterEditor.test.ts packages/react/src/paged-editor/headerFooterContent.test.ts packages/react/src/paged-editor/PagedEditor.tableMeasure.test.ts
```

Result:
- `7 pass`
- `0 fail`
- `20 expect() calls`

Additional gate:
- `npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-js-editor' typecheck` exited with code `0`.
- `npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-js-editor' build` exited with code `0`.
- Build emitted only the known non-blocking warnings: Tailwind content config, Browserslist/caniuse-lite, and mixed named/default exports for existing chunks.

## Header table final interaction fixes: delete-row and collapsed editor borders

Implemented in the professional source patch on `2026-04-30`.

Context:
- The synthetic header table fixture still exposed two interaction polish issues after cell-selection parity:
  - the inline header editor showed the middle divider as visually doubled/thicker than the static render;
  - context-menu `Delete row` did nothing for a one-row header table.
- The open-header / close-header no-op lifecycle was rechecked on the fixture and did not mutate the final static header render. The remaining visual difference was edit-mode UI/selection state, not saved document layout drift.

Root cause:
- The inline header/footer ProseMirror table CSS used `border-collapse: separate` with adjacent cells that each had their own DOCX border. That can render the shared divider as two borders, while Word/static render presents a shared divider.
- The core table command intentionally returned `false` when `deleteRow` was invoked on a table with `rowCount <= 1`. That made sense as a guard against an invalid empty table, but it left one-row tables impossible to remove through the row command.

Patch shape:
- `analysis/eigenpal-upstream-source/packages/react/src/styles/editor.css`
  - Header/footer inline ProseMirror tables now use `border-collapse: collapse` while keeping fixed table layout and zero border spacing.
  - This matches the final painter/Word shared-border geometry instead of layering adjacent cell borders.
- `analysis/eigenpal-upstream-source/packages/core/src/prosemirror/extensions/nodes/TableExtension.ts`
  - `deleteRow` now treats the last remaining row as table deletion.
  - ProseMirror normalizes the emptied document to a paragraph, so the editor remains valid/editable.
  - This is implemented at the table-command layer, not as a header-specific context-menu workaround.

Regression coverage:
- Added `TableExtension column commands > deleteRow removes the table when deleting its only row`.

Browser validation on `127.0.0.1:5180`:
- URL: `/t10?fixturePath=/fixtures/synthetic/header-placeholder-table.docx&selectionfix=delete-row-last-row-20260430`
- Selected the header table cell, opened the context menu, clicked `Delete row`.
- Result: the one-row table was removed and the header editor remained active with an empty editable header region.
- Rechecked no-op open/close lifecycle crops; no header layout mutation was observed. Pixel differences after close were limited to normal caret/selection state in the body after the exit click.

Verification:
```powershell
npm.cmd exec --yes bun -- test packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/react/src/components/InlineHeaderFooterEditor.test.ts
# 23 pass, 0 fail, 73 expect() calls

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-js-editor' typecheck
# Exited with code 0

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-js-editor' build
# Exited with code 0
```

Known non-blocking build warnings:
- Tailwind `content` configuration warning.
- Browserslist/caniuse-lite outdated warning.
- Existing tsup mixed named/default export warnings for lazy chunks.

### Review follow-up: stable paragraph formatting comparison

Implemented on `2026-04-30` after consolidation review.

Reason:
- The previous comparison used `JSON.stringify(...)` for paragraph formatting deltas.
- It worked for the internally generated objects, but a professional upstream patch should not depend on object key insertion order when comparing semantic formatting values.

Patch shape:
- Replaced the stringified comparison with a local stable deep equality helper in `fromProseDoc.ts`.
- The helper:
  - treats strict equality as equal;
  - treats `null`/`undefined` consistently;
  - compares arrays in order;
  - compares object keys sorted and ignores `undefined` object properties.
- Added a regression proving that reordered inherited border formatting does not become artificial explicit paragraph formatting.

Verification:
```powershell
npm.cmd exec --yes bun -- test packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/react/src/components/InlineHeaderFooterEditor.test.ts
# 46 pass, 0 fail, 123 expect() calls

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-core' typecheck
# Exited with code 0

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-js-editor' typecheck
# Exited with code 0
```

### Final subagent review follow-up: runProperties round-trip and CellSelection coverage

Implemented on `2026-04-30` after the GPT-5.5 xhigh consolidation review.

Review findings addressed:
- `fromProseDoc.ts` could materialize inherited `runProperties` during a no-op header table round-trip when the original paragraph had explicit partial run formatting and document defaults supplied additional resolved text formatting.
- Inline header/footer table selection coverage was too shallow: tests verified candidate positions, but not the native `CellSelection` creation path used by the editor gesture.

Patch shape:
- `analysis/eigenpal-upstream-source/packages/core/src/prosemirror/conversion/fromProseDoc.ts`
  - Added `buildTextFormattingOverride(...)` so text formatting is compared against the resolved baseline but preserves the original partial `runProperties` on no-op saves.
  - Real user changes are still emitted as explicit deltas; inherited values are not written back as new direct formatting.
- `analysis/eigenpal-upstream-source/packages/core/src/prosemirror/conversion/toProseDoc.test.ts`
  - Added regression coverage proving inherited document-default run properties are not materialized during a no-op header table round-trip.
- `analysis/eigenpal-upstream-source/packages/react/src/components/InlineHeaderFooterEditor.tsx`
  - Extracted `createTableCellSelectionFromElement(...)` so the header/footer inline editor can be tested at the same native `CellSelection` level used by the runtime double-click behavior.
- `analysis/eigenpal-upstream-source/packages/react/src/components/InlineHeaderFooterEditor.test.ts`
  - Added coverage that creates a real ProseMirror table document and verifies a DOM table cell maps to a native `CellSelection`.

Verification after fixes:
```powershell
npm.cmd exec --yes bun -- test packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/react/src/components/InlineHeaderFooterEditor.test.ts
# 48 pass, 0 fail, 127 expect() calls

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-core' typecheck
# Exited with code 0

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-js-editor' typecheck
# Exited with code 0

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-js-editor' build
# Exited with code 0
```

Build warnings observed and classified as non-blocking/existing:
- Tailwind content configuration warning.
- Browserslist/caniuse-lite outdated warning.
- Existing tsup mixed named/default export warnings for lazy chunks.

### Final review follow-up: applied paragraph style baseline

Implemented on `2026-04-30` after the final GPT-5.5 xhigh review held consolidation.

Review finding addressed:
- Applying a paragraph style updated the visible ProseMirror paragraph attrs to the newly selected style values, but `_resolvedFormatting` still represented the old import-time baseline.
- On export, `fromProseDoc.ts` could then serialize the new style's inherited spacing as direct paragraph formatting, for example `{ styleId: 'Heading1', spaceBefore: 480, spaceAfter: 240 }` instead of only `{ styleId: 'Heading1' }`.

Root cause:
- The renderer/serializer model now correctly uses `_resolvedFormatting` as the semantic baseline for style-resolved values.
- `applyStyle` was the remaining command path that changed style-resolved paragraph attrs without changing that baseline.

Patch shape:
- `analysis/eigenpal-upstream-source/packages/core/src/prosemirror/extensions/core/ParagraphExtension.ts`
  - Added a small helper to build the resolved paragraph-formatting baseline for an applied style.
  - `applyStyle` now updates `_resolvedFormatting` at the same time it updates `styleId` and style-controlled paragraph attrs.
- `analysis/eigenpal-upstream-source/packages/core/src/prosemirror/conversion/toProseDoc.test.ts`
  - Added a regression that applies `Heading1` through the real paragraph command and verifies export keeps only `{ styleId: 'Heading1' }`, without materializing inherited style spacing as direct formatting.

Verification:
```powershell
npm.cmd exec --yes bun -- test packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/react/src/components/InlineHeaderFooterEditor.test.ts
# 49 pass, 0 fail, 130 expect() calls

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-core' typecheck
# Exited with code 0

npm.cmd exec --yes bun -- run --filter '@eigenpal/docx-js-editor' typecheck
# Exited with code 0
```

### Final review follow-up: style-change baseline for existing direct formatting

Implemented on `2026-04-30` after the follow-up GPT-5.5 xhigh review.

Review finding addressed:
- The first `applyStyle` baseline fix covered paragraphs without existing direct spacing.
- A paragraph that already had direct paragraph formatting could still export the newly applied style's resolved values as direct formatting because `fromProseDoc.ts` preferred original inline formatting over the new style baseline.
- Example risk: applying `Heading1` over a paragraph with previous direct spacing could export `{ styleId: 'Heading1', spaceAfter: 240 }` instead of only `{ styleId: 'Heading1' }`.

Root cause:
- For no-op round-trip, original inline formatting must remain the primary baseline.
- For a real style change, style-controlled paragraph attrs should compare against the newly resolved style baseline instead. Otherwise the serializer treats style values as user direct overrides.

Patch shape:
- `analysis/eigenpal-upstream-source/packages/core/src/prosemirror/conversion/fromProseDoc.ts`
  - Normalizes `null`/`undefined` style IDs before detecting style changes.
  - When `styleId` changed, paragraph-formatting comparisons use `_resolvedFormatting` as the baseline and delete stale original direct properties that now match the applied style.
  - Text-formatting comparison follows the same rule so inherited/default run properties are not materialized as direct `runProperties`.
- `analysis/eigenpal-upstream-source/packages/core/src/prosemirror/extensions/core/ParagraphExtension.ts`
  - `applyStyle` now updates `defaultTextFormatting` and `_resolvedFormatting` together with the style-controlled paragraph attrs.
- `analysis/eigenpal-upstream-source/packages/core/src/prosemirror/conversion/toProseDoc.test.ts`
  - Added regressions for applying a style over previous direct spacing and over inherited/direct run properties.

Verification:
```powershell
npm.cmd exec --yes bun -- test packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/react/src/components/InlineHeaderFooterEditor.test.ts
# 51 pass, 0 fail, 136 expect() calls

.\node_modules\.bin\tsc.exe --noEmit -p packages\core\tsconfig.json
# Exited with code 0

.\node_modules\.bin\tsc.exe --noEmit -p packages\react\tsconfig.json
# Exited with code 0

# React package build was run from packages/react using tsup + Tailwind CSS directly because the sandbox blocked esbuild subprocess spawning through bun run.
..\..\node_modules\.bin\tsup.exe --config tsup.config.ts
..\..\node_modules\.bin\tailwindcss.exe -c ..\..\tailwind.config.lib.js -i .\src\styles\editor.css -o .\dist\styles.css --minify
# Exited with code 0
```

Known non-blocking warnings remain unchanged:
- Tailwind content configuration warning.
- Browserslist/caniuse-lite outdated warning.
- Existing tsup mixed named/default export warnings for lazy chunks.

### Final independent review result

Completed on `2026-04-30` with GPT-5.5 xhigh subagent review after the final style-baseline fixes.

Result:
- No remaining P0/P1/P2 blockers found.
- Previous P2 blocker was confirmed fixed fully.
- The reviewer confirmed:
  - `fromProseDoc.ts` now switches to `_resolvedFormatting` on style changes and clears stale direct values, including run properties.
  - `ParagraphExtension.ts` updates both `defaultTextFormatting` and `_resolvedFormatting` when applying a style.
  - Regression coverage exists for prior direct spacing and inherited/direct run properties.

Reviewer verdict:
```text
Verdict: PASS for Package consolidation
```

### Claude Code review follow-up: percentage table column redistribution

Implemented on `2026-04-30` after external Claude Code review.

Review finding addressed:
- `addColumnLeft` / `addColumnRight` preserved the `pct` table model, but only assigned the newly inserted cell its new percent width.
- Existing cells kept their previous widths, for example `50 / 50 -> 50 / 33 / 50`, making the row exceed the table width.
- `deleteColumn` had the inverse risk, leaving remaining percent cells below the full table width.

Final source decision:
- Top-level inserted tables remain `width=5000`, `widthType="pct"` because this fits body/header/footer content boxes without hardcoded page-width assumptions.
- The fix is to normalize percent cell widths at the same command boundary where fixed `dxa` tables normalize `colwidth`.

Patch shape:
- Added percent-width redistribution for `pct` tables after `addColumnLeft`, `addColumnRight`, and `deleteColumn`.
- Kept the existing `dxa` normalization path for fixed-width tables.
- Cleared stale `colwidth` / `columnWidths` metadata for percent tables so old fixed-grid values do not leak into export.
- Replaced the inserted-table selection magic offset with `Selection.findFrom(...)`.
- Named the width round-trip tolerance as `WIDTH_ROUNDTRIP_TOLERANCE_TWIPS` with a short rounding comment.

Regression coverage:
```text
addColumnRight: 50 / 50 -> 33 / 33 / 34
addColumnLeft:  50 / 50 -> 33 / 33 / 34
deleteColumn:   33 / 33 / 34 -> 50 / 50
```

Verification:
```powershell
npm.cmd exec --yes bun -- test packages/core/src/prosemirror/conversion/toProseDoc.test.ts packages/core/src/prosemirror/extensions/nodes/TableExtension.test.ts packages/react/src/components/InlineHeaderFooterEditor.test.ts
# 54 pass, 0 fail, 145 expect() calls

.\node_modules\.bin\tsc.exe --noEmit -p packages\core\tsconfig.json
# Exited with code 0

.\node_modules\.bin\tsc.exe --noEmit -p packages\react\tsconfig.json
# Exited with code 0

# From packages/react:
..\..\node_modules\.bin\tsup.exe --config tsup.config.ts
..\..\node_modules\.bin\tailwindcss.exe -c ..\..\tailwind.config.lib.js -i .\src\styles\editor.css -o .\dist\styles.css --minify
# Exited with code 0
```

Known non-blocking warnings remain unchanged:
- Tailwind content configuration warning.
- Browserslist/caniuse-lite outdated warning.
- Existing tsup mixed named/default export warnings for lazy chunks.
