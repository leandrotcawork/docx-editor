/**
 * Integration tests for toProseDoc — theme color resolution in tables.
 *
 * Verifies that themed cell shading (w:shd with w:themeFill + w:themeFillTint/Shade)
 * is correctly resolved to RGB values on ProseMirror tableCell node attrs.
 */

import { describe, test, expect } from 'bun:test';
import { EditorState, TextSelection } from 'prosemirror-state';
import { headerFooterToProseDoc, toProseDoc } from './toProseDoc';
import { fromProseDoc, proseDocToBlocks } from './fromProseDoc';
import { ParagraphExtension } from '../extensions/core/ParagraphExtension';
import type { Document, Table, TableRow, TableCell, Theme, StyleDefinitions } from '../../types/document';

type JsonNode = { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };

const OFFICE_THEME: Theme = {
  colorScheme: {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: '44546A',
    lt2: 'E7E6E6',
    accent1: '4472C4',
    accent2: 'ED7D31',
    accent3: 'A5A5A5',
    accent4: 'FFC000',
    accent5: '5B9BD5',
    accent6: '70AD47',
    hlink: '0563C1',
    folHlink: '954F72',
  },
};

function makeCell(shading?: TableCell['formatting'] extends infer F ? F : never): TableCell {
  return {
    type: 'tableCell',
    formatting: shading as TableCell['formatting'],
    content: [
      {
        type: 'paragraph',
        content: [],
      },
    ],
  };
}

function makeTable(cells: TableCell[]): Table {
  const row: TableRow = { type: 'tableRow', cells };
  return { type: 'table', rows: [row] };
}

function makeDocument(table: Table, theme?: Theme): Document {
  return {
    package: {
      document: { content: [table] },
      theme,
    },
  };
}

// Collect all tableCell PM nodes in document order.
function collectCellAttrs(pmDoc: ReturnType<typeof toProseDoc>): Array<Record<string, unknown>> {
  const cells: Array<Record<string, unknown>> = [];
  pmDoc.descendants((node) => {
    if (node.type.name === 'tableCell') {
      cells.push(node.attrs as Record<string, unknown>);
    }
  });
  return cells;
}

function collectTableCellLikeAttrs(pmDoc: ReturnType<typeof toProseDoc>): Array<Record<string, unknown>> {
  const cells: Array<Record<string, unknown>> = [];
  pmDoc.descendants((node) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      cells.push(node.attrs as Record<string, unknown>);
    }
  });
  return cells;
}

describe('paragraph style round-trip', () => {
  test('applying a paragraph style does not serialize style-resolved spacing as direct formatting', () => {
    const styles: StyleDefinitions = {
      styles: [
        {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
          pPr: { spaceAfter: 160 },
        },
        {
          styleId: 'Heading1',
          type: 'paragraph',
          pPr: { spaceBefore: 480, spaceAfter: 240 },
          rPr: { bold: true, fontSize: 32 },
        },
      ],
    };
    const doc: Document = {
      package: {
        document: {
          content: [
            {
              type: 'paragraph',
              formatting: { styleId: 'Normal' },
              content: [{ type: 'run', content: [{ type: 'text', text: 'Title' }] }],
            },
          ],
        },
      },
    };
    const pmDoc = toProseDoc(doc, { styles });
    const state = EditorState.create({
      doc: pmDoc,
      selection: TextSelection.create(pmDoc, 1, pmDoc.content.size - 1),
    });
    const commands = ParagraphExtension().onSchemaReady({ schema: pmDoc.type.schema }).commands;
    let nextState = state;

    const applied = commands?.applyStyle('Heading1', {
      paragraphFormatting: { spaceBefore: 480, spaceAfter: 240 },
      runFormatting: { bold: true, fontSize: 32 },
    })(state, (tr) => {
      nextState = state.apply(tr);
    });

    expect(applied).toBe(true);
    const roundTripped = fromProseDoc(nextState.doc);
    const paragraph = roundTripped.package.document.content[0];

    expect(paragraph?.type).toBe('paragraph');
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected first block to remain a paragraph');
    }
    expect(paragraph.formatting).toEqual({ styleId: 'Heading1' });
  });

  test('applying a paragraph style clears previous direct spacing instead of replacing it with style spacing', () => {
    const styles: StyleDefinitions = {
      styles: [
        {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
          pPr: { spaceAfter: 160 },
        },
        {
          styleId: 'Heading1',
          type: 'paragraph',
          pPr: { spaceBefore: 480, spaceAfter: 240 },
        },
      ],
    };
    const doc: Document = {
      package: {
        document: {
          content: [
            {
              type: 'paragraph',
              formatting: { styleId: 'Normal', spaceAfter: 80 },
              content: [{ type: 'run', content: [{ type: 'text', text: 'Title' }] }],
            },
          ],
        },
      },
    };
    const pmDoc = toProseDoc(doc, { styles });
    const state = EditorState.create({
      doc: pmDoc,
      selection: TextSelection.create(pmDoc, 1, pmDoc.content.size - 1),
    });
    const commands = ParagraphExtension().onSchemaReady({ schema: pmDoc.type.schema }).commands;
    let nextState = state;

    const applied = commands?.applyStyle('Heading1', {
      paragraphFormatting: { spaceBefore: 480, spaceAfter: 240 },
    })(state, (tr) => {
      nextState = state.apply(tr);
    });

    expect(applied).toBe(true);
    const roundTripped = fromProseDoc(nextState.doc);
    const paragraph = roundTripped.package.document.content[0];

    expect(paragraph?.type).toBe('paragraph');
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected first block to remain a paragraph');
    }
    expect(paragraph.formatting).toEqual({ styleId: 'Heading1' });
  });

  test('applying a paragraph style does not serialize inherited run properties as direct formatting', () => {
    const styles: StyleDefinitions = {
      docDefaults: {
        rPr: { fontSize: 22 },
      },
      styles: [
        {
          styleId: 'Normal',
          type: 'paragraph',
          default: true,
        },
        {
          styleId: 'Heading1',
          type: 'paragraph',
          pPr: { spaceBefore: 480 },
        },
      ],
    };
    const doc: Document = {
      package: {
        document: {
          content: [
            {
              type: 'paragraph',
              formatting: { styleId: 'Normal', runProperties: { italic: true } },
              content: [{ type: 'run', content: [{ type: 'text', text: 'Title' }] }],
            },
          ],
        },
      },
    };
    const pmDoc = toProseDoc(doc, { styles });
    const state = EditorState.create({
      doc: pmDoc,
      selection: TextSelection.create(pmDoc, 1, pmDoc.content.size - 1),
    });
    const commands = ParagraphExtension().onSchemaReady({ schema: pmDoc.type.schema }).commands;
    let nextState = state;

    const applied = commands?.applyStyle('Heading1', {
      paragraphFormatting: { spaceBefore: 480 },
      runFormatting: { fontSize: 22 },
    })(state, (tr) => {
      nextState = state.apply(tr);
    });

    expect(applied).toBe(true);
    const roundTripped = fromProseDoc(nextState.doc);
    const paragraph = roundTripped.package.document.content[0];

    expect(paragraph?.type).toBe('paragraph');
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected first block to remain a paragraph');
    }
    expect(paragraph.formatting).toEqual({ styleId: 'Heading1' });
  });
});

describe('headerFooterToProseDoc - table sizing metadata', () => {
  test('dxa cell widths initialize prosemirror-tables colwidth metadata', () => {
    const table: Table = {
      type: 'table',
      formatting: {
        width: { value: 9026, type: 'dxa' },
      },
      columnWidths: [4200, 4826],
      rows: [
        {
          type: 'tableRow',
          cells: [
            makeCell({ width: { value: 4200, type: 'dxa' } }),
            makeCell({ width: { value: 4826, type: 'dxa' } }),
          ],
        },
      ],
    };

    const pmDoc = headerFooterToProseDoc([table]);
    const cells = collectTableCellLikeAttrs(pmDoc);

    expect(cells[0].width).toBe(4200);
    expect(cells[0].widthType).toBe('dxa');
    expect(cells[0].colwidth).toEqual([280]);
    expect(cells[1].width).toBe(4826);
    expect(cells[1].widthType).toBe('dxa');
    expect(cells[1].colwidth).toEqual([322]);
  });

  test('tblGrid widths initialize prosemirror-tables colwidth metadata without cell widths', () => {
    const table: Table = {
      type: 'table',
      formatting: {
        width: { value: 9026, type: 'dxa' },
      },
      columnWidths: [4200, 4826],
      rows: [
        {
          type: 'tableRow',
          cells: [makeCell(), makeCell()],
        },
      ],
    };

    const pmDoc = headerFooterToProseDoc([table]);
    const cells = collectTableCellLikeAttrs(pmDoc);

    expect(cells[0].widthType).toBe('pct');
    expect(cells[0].colwidth).toEqual([280]);
    expect(cells[1].widthType).toBe('pct');
    expect(cells[1].colwidth).toEqual([322]);
  });

  test('does not materialize inherited paragraph spacing during header table round-trip', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [4252, 4252],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            {
              type: 'tableCell',
              content: [
                { type: 'paragraph', formatting: { alignment: 'left' }, content: [] },
                { type: 'paragraph', content: [] },
              ],
            },
            makeCell(),
          ],
        },
      ],
    };
    const pmDoc = headerFooterToProseDoc([table], {
      styles: {
        docDefaults: {
          pPr: { spaceAfter: 160, lineSpacing: 259, lineSpacingRule: 'auto' },
        },
        styles: [],
      },
    });

    const [roundTrippedTable] = proseDocToBlocks(pmDoc) as Table[];
    const secondParagraph = roundTrippedTable.rows[0]?.cells[0]?.content[1];

    expect(secondParagraph?.type).toBe('paragraph');
    expect(secondParagraph?.formatting).toBeUndefined();
  });

  test('treats reordered resolved formatting objects as unchanged', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [4252, 4252],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [] }],
            },
            makeCell(),
          ],
        },
      ],
    };
    const pmDoc = headerFooterToProseDoc([table], {
      styles: {
        docDefaults: {
          pPr: {
            borders: {
              bottom: { color: { rgb: '7F1D1D' }, size: 8, style: 'single' },
            },
          },
        },
        styles: [],
      },
    });
    const json = pmDoc.toJSON() as JsonNode;
    const reorderBorderAttrs = (node: JsonNode) => {
      if (node.type === 'paragraph' && node.attrs) {
        node.attrs.borders = {
          bottom: { style: 'single', size: 8, color: { rgb: '7F1D1D' } },
        };
      }
      node.content?.forEach(reorderBorderAttrs);
    };
    reorderBorderAttrs(json);

    const [roundTrippedTable] = proseDocToBlocks(pmDoc.type.schema.nodeFromJSON(json)) as Table[];
    const paragraph = roundTrippedTable.rows[0]?.cells[0]?.content[0];

    expect(paragraph?.type).toBe('paragraph');
    expect(paragraph?.formatting).toBeUndefined();
  });

  test('does not materialize inherited runProperties during no-op header table round-trip', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [4252, 4252],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            {
              type: 'tableCell',
              content: [
                {
                  type: 'paragraph',
                  formatting: { runProperties: { bold: true } },
                  content: [],
                },
              ],
            },
            makeCell(),
          ],
        },
      ],
    };
    const pmDoc = headerFooterToProseDoc([table], {
      styles: {
        docDefaults: {
          rPr: {
            fontSize: 22,
            fontFamily: { ascii: 'Calibri', hAnsi: 'Calibri' },
          },
        },
        styles: [],
      },
    });

    const [roundTrippedTable] = proseDocToBlocks(pmDoc) as Table[];
    const paragraph = roundTrippedTable.rows[0]?.cells[0]?.content[0];

    expect(paragraph?.type).toBe('paragraph');
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected a paragraph in the first header table cell');
    }
    expect(paragraph.formatting?.runProperties).toEqual({ bold: true });
  });

  test('preserves user-applied spacing on originally unformatted header table paragraphs', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [4252, 4252],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [] }],
            },
            makeCell(),
          ],
        },
      ],
    };
    const pmDoc = headerFooterToProseDoc([table], {
      styles: {
        docDefaults: {
          pPr: { spaceAfter: 160, lineSpacing: 259, lineSpacingRule: 'auto' },
        },
        styles: [],
      },
    });
    const json = pmDoc.toJSON() as JsonNode;
    const applySpacingEdit = (node: JsonNode) => {
      if (node.type === 'paragraph' && node.attrs) {
        node.attrs.spaceAfter = 240;
      }
      node.content?.forEach(applySpacingEdit);
    };
    applySpacingEdit(json);

    const [roundTrippedTable] = proseDocToBlocks(pmDoc.type.schema.nodeFromJSON(json)) as Table[];
    const paragraph = roundTrippedTable.rows[0]?.cells[0]?.content[0];

    expect(paragraph?.type).toBe('paragraph');
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected a paragraph in the first header table cell');
    }
    expect(paragraph.formatting?.spaceAfter).toBe(240);
  });

  test('preserves user-applied paragraph borders on originally unformatted header table paragraphs', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [4252, 4252],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [] }],
            },
            makeCell(),
          ],
        },
      ],
    };
    const pmDoc = headerFooterToProseDoc([table], {
      styles: {
        docDefaults: {
          pPr: { spaceAfter: 160 },
        },
        styles: [],
      },
    });
    const json = pmDoc.toJSON() as JsonNode;
    const applyBorderEdit = (node: JsonNode) => {
      if (node.type === 'paragraph' && node.attrs) {
        node.attrs.borders = {
          bottom: { style: 'single', size: 8, color: { rgb: '7F1D1D' } },
        };
      }
      node.content?.forEach(applyBorderEdit);
    };
    applyBorderEdit(json);

    const [roundTrippedTable] = proseDocToBlocks(pmDoc.type.schema.nodeFromJSON(json)) as Table[];
    const paragraph = roundTrippedTable.rows[0]?.cells[0]?.content[0];

    expect(paragraph?.type).toBe('paragraph');
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected a paragraph in the first header table cell');
    }
    expect(paragraph.formatting?.borders?.bottom?.style).toBe('single');
    expect(paragraph.formatting?.spaceAfter).toBeUndefined();
  });

  test('preserves clearing inherited hanging indent on originally unformatted header paragraphs', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [4252, 4252],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [] }],
            },
            makeCell(),
          ],
        },
      ],
    };
    const pmDoc = headerFooterToProseDoc([table], {
      styles: {
        docDefaults: {
          pPr: { indentFirstLine: 360, hangingIndent: true },
        },
        styles: [],
      },
    });
    const json = pmDoc.toJSON() as JsonNode;
    const clearHangingIndent = (node: JsonNode) => {
      if (node.type === 'paragraph' && node.attrs) {
        node.attrs.hangingIndent = false;
      }
      node.content?.forEach(clearHangingIndent);
    };
    clearHangingIndent(json);

    const [roundTrippedTable] = proseDocToBlocks(pmDoc.type.schema.nodeFromJSON(json)) as Table[];
    const paragraph = roundTrippedTable.rows[0]?.cells[0]?.content[0];

    expect(paragraph?.type).toBe('paragraph');
    if (paragraph?.type !== 'paragraph') {
      throw new Error('Expected a paragraph in the first header table cell');
    }
    expect(paragraph.formatting?.indentFirstLine).toBe(360);
    expect(paragraph.formatting?.hangingIndent).toBe(false);
  });
});
describe('toProseDoc — table cell theme color resolution', () => {
  test('cell with RGB fill sets backgroundColor directly', () => {
    const cell = makeCell({ shading: { fill: { rgb: 'FF0000' } } });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBe('FF0000');
  });

  test('cell with theme fill resolves to base theme color', () => {
    // w:themeFill="accent1" with no tint/shade → base color
    const cell = makeCell({ shading: { fill: { themeColor: 'accent1' } } });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBe('4472C4');
  });

  test('cell with theme fill + tint resolves to lightened RGB', () => {
    // accent1 (#4472C4) with themeFillTint="33" → near-white blue
    // OOXML: t = 0x33/255 ≈ 0.2 → keep 20% color, 80% white
    const cell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBe('DAE3F3');
  });

  test('cell with theme fill + shade resolves to darkened RGB', () => {
    // background1 (lt1 = FFFFFF) with themeFillShade="F2" → light gray
    // OOXML: s = 0xF2/255 ≈ 0.949 → keep 95% of color
    const cell = makeCell({
      shading: { fill: { themeColor: 'background1', themeShade: 'F2' } },
    });
    const doc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBe('F2F2F2');
  });

  test('cell with themed fill and no document theme leaves backgroundColor undefined', () => {
    // Without a theme, theme color references can't be resolved.
    // The rgb fallback is already overwritten by the parser when themeFill is present.
    const cell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const doc = makeDocument(makeTable([cell]), undefined);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    expect(cells[0].backgroundColor).toBeFalsy();
  });

  test('multiple cells with different theme tints resolve independently', () => {
    // Mimics the real-world scenario: title row with dark tint, section row with light tint.
    const titleCell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '99' } },
    });
    const sectionCell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const doc = makeDocument(makeTable([titleCell, sectionCell]), OFFICE_THEME);
    const pmDoc = toProseDoc(doc);
    const cells = collectCellAttrs(pmDoc);
    // tint=99 (0.6) → medium blue
    expect(cells[0].backgroundColor).toBe('8FAADC');
    // tint=33 (0.2) → near-white
    expect(cells[1].backgroundColor).toBe('DAE3F3');
  });
});

describe('toProseDoc ↔ fromProseDoc round-trip — theme shading preservation', () => {
  function firstCellShading(doc: Document) {
    const table = doc.package.document.content[0] as Table;
    return table?.rows[0]?.cells[0]?.formatting?.shading;
  }

  test('themed cell with tint survives round-trip with theme refs intact', () => {
    const cell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const inDoc = makeDocument(makeTable([cell]), OFFICE_THEME);

    const pmDoc = toProseDoc(inDoc);
    const outDoc = fromProseDoc(pmDoc, inDoc);
    const shading = firstCellShading(outDoc);

    expect(shading?.fill?.themeColor).toBe('accent1');
    expect(shading?.fill?.themeTint).toBe('33');
    // The resolved rgb is not injected when unchanged — the original shape stays.
    expect(shading?.fill?.rgb).toBeUndefined();
  });

  test('themed cell with shade survives round-trip', () => {
    const cell = makeCell({
      shading: { fill: { themeColor: 'background1', themeShade: 'F2' } },
    });
    const inDoc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const outDoc = fromProseDoc(toProseDoc(inDoc), inDoc);
    const shading = firstCellShading(outDoc);
    expect(shading?.fill?.themeColor).toBe('background1');
    expect(shading?.fill?.themeShade).toBe('F2');
  });

  test('user-changed backgroundColor overrides theme refs with rgb', () => {
    const cell = makeCell({
      shading: { fill: { themeColor: 'accent1', themeTint: '33' } },
    });
    const inDoc = makeDocument(makeTable([cell]), OFFICE_THEME);
    const pmDoc = toProseDoc(inDoc);

    // Simulate the user picking a new color: swap backgroundColor on every cell.
    const json = pmDoc.toJSON() as JsonNode;
    const setBg = (n: JsonNode) => {
      if (n.type === 'tableCell' && n.attrs) n.attrs.backgroundColor = 'FF00FF';
      n.content?.forEach(setBg);
    };
    setBg(json);
    const edited = pmDoc.type.schema.nodeFromJSON(json);

    const shading = firstCellShading(fromProseDoc(edited, inDoc));
    expect(shading?.fill?.rgb).toBe('FF00FF');
    expect(shading?.fill?.themeColor).toBeUndefined();
  });
});

describe('toProseDoc ↔ fromProseDoc round-trip — table sizing metadata', () => {
  function firstTable(doc: Document): Table {
    return doc.package.document.content[0] as Table;
  }

  function resizeFirstRowColwidths(pmDoc: ReturnType<typeof toProseDoc>, colwidths: number[]) {
    const json = pmDoc.toJSON() as JsonNode;
    let cellIndex = 0;
    const resize = (node: JsonNode) => {
      if ((node.type === 'tableCell' || node.type === 'tableHeader') && node.attrs) {
        node.attrs.colwidth = [colwidths[cellIndex++]];
      }
      node.content?.forEach(resize);
    };
    resize(json);
    return pmDoc.type.schema.nodeFromJSON(json);
  }

  test('preserves tblGrid column widths and row height without edits', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [1800, 3600],
      formatting: {
        width: { value: 5400, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          formatting: {
            height: { value: 420, type: 'dxa' },
            heightRule: 'atLeast',
          },
          cells: [makeCell(), makeCell()],
        },
      ],
    };
    const inDoc = makeDocument(table);

    const outTable = firstTable(fromProseDoc(toProseDoc(inDoc), inDoc));

    expect(outTable.columnWidths).toEqual([1800, 3600]);
    expect(outTable.rows[0]?.formatting?.height).toEqual({ value: 420, type: 'dxa' });
    expect(outTable.rows[0]?.formatting?.heightRule).toBe('atLeast');
  });

  test('preserves non-divisible tblGrid widths without edit-rounding drift', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [2806, 2892, 2806],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            makeCell({ width: { value: 2806, type: 'dxa' } }),
            makeCell({ width: { value: 2892, type: 'dxa' } }),
            makeCell({ width: { value: 2806, type: 'dxa' } }),
          ],
        },
      ],
    };
    const inDoc = makeDocument(table);

    const outTable = firstTable(fromProseDoc(toProseDoc(inDoc), inDoc));

    expect(outTable.columnWidths).toEqual([2806, 2892, 2806]);
    expect(outTable.rows[0]?.cells.map((cell) => cell.formatting?.width?.value)).toEqual([
      2806,
      2892,
      2806,
    ]);
  });

  test('preserves pct cell width semantics when tblGrid supplies editor colwidths', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [1800, 3600],
      formatting: {
        width: { value: 5000, type: 'pct' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            makeCell({ width: { value: 2500, type: 'pct' } }),
            makeCell({ width: { value: 2500, type: 'pct' } }),
          ],
        },
      ],
    };
    const inDoc = makeDocument(table);

    const outTable = firstTable(fromProseDoc(toProseDoc(inDoc), inDoc));

    expect(outTable.formatting?.width).toEqual({ value: 5000, type: 'pct' });
    expect(outTable.columnWidths).toEqual([1800, 3600]);
    expect(outTable.rows[0]?.cells.map((cell) => cell.formatting?.width)).toEqual([
      { value: 2500, type: 'pct' },
      { value: 2500, type: 'pct' },
    ]);
  });

  test('uses edited ProseMirror colwidths as exported tblGrid widths', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [1800, 3600],
      formatting: {
        width: { value: 5400, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [makeCell(), makeCell()],
        },
      ],
    };
    const inDoc = makeDocument(table);
    const resizedPmDoc = resizeFirstRowColwidths(toProseDoc(inDoc), [150, 210]);

    const outTable = firstTable(fromProseDoc(resizedPmDoc, inDoc));

    expect(outTable.columnWidths).toEqual([2250, 3150]);
  });

  test('repairs partial table columnWidths from resized cell widths', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [2806, 2892, 2806],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [makeCell(), makeCell(), makeCell()],
        },
        {
          type: 'tableRow',
          cells: [makeCell(), makeCell(), makeCell()],
        },
      ],
    };
    const inDoc = makeDocument(table);
    const pmDoc = toProseDoc(inDoc);
    const json = pmDoc.toJSON() as JsonNode;

    const setWidths = (node: JsonNode) => {
      if (node.type === 'table' && node.attrs) {
        node.attrs.columnWidths = [null, null, 2805];
      }

      node.content?.forEach(setWidths);
    };
    setWidths(json);

    let cellIndex = 0;
    const resizedWidths = [3541, 2157, 2806, 3541, 2157, 2806];
    const applyCellWidths = (node: JsonNode) => {
      if ((node.type === 'tableCell' || node.type === 'tableHeader') && node.attrs) {
        node.attrs.width = resizedWidths[cellIndex++];
        node.attrs.widthType = 'dxa';
        node.attrs.colwidth = null;
      }
      node.content?.forEach(applyCellWidths);
    };
    applyCellWidths(json);

    const resizedPmDoc = pmDoc.type.schema.nodeFromJSON(json);
    const outTable = firstTable(fromProseDoc(resizedPmDoc, inDoc));

    expect(outTable.columnWidths).toEqual([3541, 2157, 2806]);
  });

  test('does not repair partial table columnWidths from a merged first row', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [2806, 2892, 2806],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            makeCell({ width: { value: 5698, type: 'dxa' }, gridSpan: 2 }),
            makeCell({ width: { value: 2806, type: 'dxa' } }),
          ],
        },
        {
          type: 'tableRow',
          cells: [
            makeCell({ width: { value: 2806, type: 'dxa' } }),
            makeCell({ width: { value: 2892, type: 'dxa' } }),
            makeCell({ width: { value: 2806, type: 'dxa' } }),
          ],
        },
      ],
    };
    const inDoc = makeDocument(table);
    const pmDoc = toProseDoc(inDoc);
    const json = pmDoc.toJSON() as JsonNode;

    const setPartialTableWidths = (node: JsonNode) => {
      if (node.type === 'table' && node.attrs) {
        node.attrs.columnWidths = [null, null, 2805];
      }

      if ((node.type === 'tableCell' || node.type === 'tableHeader') && node.attrs) {
        node.attrs.colwidth = null;
      }

      node.content?.forEach(setPartialTableWidths);
    };
    setPartialTableWidths(json);

    const resizedPmDoc = pmDoc.type.schema.nodeFromJSON(json);
    const outTable = firstTable(fromProseDoc(resizedPmDoc, inDoc));

    expect(outTable.columnWidths).toBeUndefined();
  });

  test('uses summed colwidth as exported width for resized merged cells', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [2806, 2892, 2806],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            makeCell({ width: { value: 5698, type: 'dxa' }, gridSpan: 2 }),
            makeCell({ width: { value: 2806, type: 'dxa' } }),
          ],
        },
        {
          type: 'tableRow',
          cells: [
            makeCell({ width: { value: 2806, type: 'dxa' } }),
            makeCell({ width: { value: 2892, type: 'dxa' } }),
            makeCell({ width: { value: 2806, type: 'dxa' } }),
          ],
        },
      ],
    };
    const inDoc = makeDocument(table);
    const pmDoc = toProseDoc(inDoc);
    const json = pmDoc.toJSON() as JsonNode;

    const resizedColwidths = [
      [238, 142],
      [187],
      [238],
      [142],
      [187],
    ];
    let cellIndex = 0;
    const resizeCells = (node: JsonNode) => {
      if ((node.type === 'tableCell' || node.type === 'tableHeader') && node.attrs) {
        node.attrs.colwidth = resizedColwidths[cellIndex++] ?? node.attrs.colwidth;
      }

      node.content?.forEach(resizeCells);
    };
    resizeCells(json);

    const resizedPmDoc = pmDoc.type.schema.nodeFromJSON(json);
    const outTable = firstTable(fromProseDoc(resizedPmDoc, inDoc));

    expect(outTable.columnWidths).toEqual([3570, 2130, 2805]);
    expect(outTable.rows[0]?.cells[0]?.formatting?.gridSpan).toBe(2);
    expect(outTable.rows[0]?.cells[0]?.formatting?.width).toEqual({ value: 5700, type: 'dxa' });
  });
});
