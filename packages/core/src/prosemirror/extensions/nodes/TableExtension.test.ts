import { describe, expect, test } from 'bun:test';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '../../schema';
import { TablePluginExtension } from './TableExtension';

function renderTableCellStyle(borderColor: { rgb?: string; auto?: boolean }): string {
  const paragraph = schema.nodes.paragraph.create();
  const cell = schema.nodes.tableCell.create(
    {
      borders: {
        top: { style: 'single', size: 8, color: borderColor },
      },
    },
    [paragraph]
  );
  const spec = schema.nodes.tableCell.spec.toDOM?.(cell);
  if (!Array.isArray(spec)) return '';
  const attrs = spec[1] as Record<string, string> | undefined;
  return attrs?.style ?? '';
}

describe('TableExtension cell border DOM styles', () => {
  test('normalizes OOXML auto border colors to valid black CSS', () => {
    expect(renderTableCellStyle({ rgb: 'auto' })).toContain('border-top: 1px solid #000000');
    expect(renderTableCellStyle({ auto: true })).toContain('border-top: 1px solid #000000');
  });
});

function makeTextCell(text: string, colwidth: number) {
  return schema.nodes.tableCell.create(
    {
      width: colwidth * 15,
      widthType: 'dxa',
      colwidth: [colwidth],
    },
    schema.nodes.paragraph.create(null, schema.text(text))
  );
}

function firstParagraphTextPos(doc: ReturnType<typeof schema.node>) {
  let pos: number | undefined;
  doc.descendants((node, nodePos) => {
    if (pos == null && node.type.name === 'paragraph' && node.textContent) {
      pos = nodePos + 1;
      return false;
    }
    return true;
  });
  if (pos == null) throw new Error('test document has no text paragraph');
  return pos;
}

function firstParagraphPos(doc: ReturnType<typeof schema.node>) {
  let pos: number | undefined;
  doc.descendants((node, nodePos) => {
    if (pos == null && node.type.name === 'paragraph') {
      pos = nodePos + 1;
      return false;
    }
    return true;
  });
  if (pos == null) throw new Error('test document has no paragraph');
  return pos;
}

function firstRowColwidths(doc: ReturnType<typeof schema.node>): number[] {
  const widths: number[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'tableRow') {
      node.forEach((cell) => {
        const colwidth = cell.attrs.colwidth as number[] | null;
        widths.push(...(colwidth ?? []));
      });
      return false;
    }
    return true;
  });
  return widths;
}

function makeFixedWidthTableDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(
      {
        width: 5400,
        widthType: 'dxa',
        columnWidths: [1800, 3600],
      },
      [
        schema.nodes.tableRow.create(null, [
          makeTextCell('A', 120),
          makeTextCell('B', 240),
        ]),
      ]
    ),
  ]);
}

function makeHeaderLikeFixedWidthTableDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(
      {
        width: 9030,
        widthType: 'dxa',
        columnWidths: [4200, 4830],
      },
      [
        schema.nodes.tableRow.create(null, [
          makeTextCell('A', 280),
          makeTextCell('B', 322),
        ]),
      ]
    ),
  ]);
}

function makeNonDivisibleFixedWidthTableDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(
      {
        width: 8504,
        widthType: 'dxa',
        columnWidths: [2806, 2892, 2806],
      },
      [
        schema.nodes.tableRow.create(null, [
          makeTextCell('A', 187),
          makeTextCell('B', 193),
          makeTextCell('C', 187),
        ]),
      ]
    ),
  ]);
}

function makePercentWidthTableDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(
      {
        width: 5000,
        widthType: 'pct',
      },
      [
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create(
            { width: 50, widthType: 'pct' },
            schema.nodes.paragraph.create(null, schema.text('A'))
          ),
          schema.nodes.tableCell.create(
            { width: 50, widthType: 'pct' },
            schema.nodes.paragraph.create(null, schema.text('B'))
          ),
        ]),
      ]
    ),
  ]);
}

function makeThreeColumnPercentWidthTableDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(
      {
        width: 5000,
        widthType: 'pct',
      },
      [
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create(
            { width: 33, widthType: 'pct' },
            schema.nodes.paragraph.create(null, schema.text('A'))
          ),
          schema.nodes.tableCell.create(
            { width: 33, widthType: 'pct' },
            schema.nodes.paragraph.create(null, schema.text('B'))
          ),
          schema.nodes.tableCell.create(
            { width: 34, widthType: 'pct' },
            schema.nodes.paragraph.create(null, schema.text('C'))
          ),
        ]),
      ]
    ),
  ]);
}

function makePercentWidthTableWithGridDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(
      {
        width: 5000,
        widthType: 'pct',
        columnWidths: [1800, 3600],
      },
      [
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create(
            { width: 50, widthType: 'pct', colwidth: [120] },
            schema.nodes.paragraph.create(null, schema.text('A'))
          ),
          schema.nodes.tableCell.create(
            { width: 50, widthType: 'pct', colwidth: [240] },
            schema.nodes.paragraph.create(null, schema.text('B'))
          ),
        ]),
      ]
    ),
  ]);
}

function makeAutoWidthTableWithGridDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(
      {
        width: null,
        widthType: 'auto',
        columnWidths: [1800, 3600],
      },
      [
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create(
            { colwidth: [120] },
            schema.nodes.paragraph.create(null, schema.text('A'))
          ),
          schema.nodes.tableCell.create(
            { colwidth: [240] },
            schema.nodes.paragraph.create(null, schema.text('B'))
          ),
        ]),
      ]
    ),
  ]);
}

function makeColspanTableDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(
      {
        width: 5400,
        widthType: 'dxa',
        columnWidths: [1800, 3600],
      },
      [
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create(
            {
              colspan: 2,
              width: 5400,
              widthType: 'dxa',
              colwidth: [120, 240],
            },
            schema.nodes.paragraph.create(null, schema.text('Merged'))
          ),
        ]),
        schema.nodes.tableRow.create(null, [makeTextCell('A', 120), makeTextCell('B', 240)]),
      ]
    ),
  ]);
}

function runTableCommand(doc: ReturnType<typeof schema.node>, commandName: string) {
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, firstParagraphPos(doc)),
  });
  const command = TablePluginExtension().onSchemaReady({ schema }).commands?.[commandName]?.();
  let dispatched = state.tr;

  expect(command?.(state, (tr) => (dispatched = tr))).toBe(true);
  return dispatched.doc;
}

function runInsertTableCommand(doc: ReturnType<typeof schema.node>, rows = 1, cols = 2) {
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, firstParagraphPos(doc)),
  });
  const command = TablePluginExtension().onSchemaReady({ schema }).commands?.insertTable?.(rows, cols);
  let dispatched = state.tr;

  expect(command?.(state, (tr) => (dispatched = tr))).toBe(true);
  return dispatched.doc;
}

function runInsertTableTransaction(doc: ReturnType<typeof schema.node>, rows = 1, cols = 2) {
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, firstParagraphPos(doc)),
  });
  const command = TablePluginExtension().onSchemaReady({ schema }).commands?.insertTable?.(rows, cols);
  let dispatched = state.tr;

  expect(command?.(state, (tr) => (dispatched = tr))).toBe(true);
  return dispatched;
}

function makeEmptyParagraphDoc() {
  return schema.nodes.doc.create(null, [schema.nodes.paragraph.create()]);
}

function topLevelBlockTypes(doc: ReturnType<typeof schema.node>): string[] {
  const types: string[] = [];
  doc.forEach((node) => types.push(node.type.name));
  return types;
}

function tableCount(doc: ReturnType<typeof schema.node>): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === 'table') count += 1;
  });
  return count;
}

function firstCellPos(doc: ReturnType<typeof schema.node>) {
  let pos: number | undefined;
  doc.descendants((node, nodePos) => {
    if (pos == null && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
      pos = nodePos;
      return false;
    }
    return true;
  });
  if (pos == null) throw new Error('test document has no table cell');
  return pos;
}

function applyResizeTransaction(doc: ReturnType<typeof schema.node>, colwidth: number) {
  const runtime = TablePluginExtension().onSchemaReady({ schema });
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, firstParagraphTextPos(doc)),
    plugins: runtime.plugins,
  });
  const cellPos = firstCellPos(doc);
  const cell = doc.nodeAt(cellPos);
  if (!cell) throw new Error('test document has no first cell');

  const tr = state.tr.setNodeMarkup(cellPos, undefined, {
    ...cell.attrs,
    width: colwidth * 15,
    widthType: 'dxa',
    colwidth: [colwidth],
  });

  return state.applyTransaction(tr).state.doc;
}

function applyColwidthOnlyResizeTransaction(doc: ReturnType<typeof schema.node>, colwidth: number) {
  const runtime = TablePluginExtension().onSchemaReady({ schema });
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, firstParagraphTextPos(doc)),
    plugins: runtime.plugins,
  });
  const cellPos = firstCellPos(doc);
  const cell = doc.nodeAt(cellPos);
  if (!cell) throw new Error('test document has no first cell');

  const tr = state.tr.setNodeMarkup(cellPos, undefined, {
    ...cell.attrs,
    colwidth: [colwidth],
  });

  return state.applyTransaction(tr).state.doc;
}

function firstTableAttrs(doc: ReturnType<typeof schema.node>): Record<string, unknown> {
  let attrs: Record<string, unknown> | undefined;
  doc.descendants((node) => {
    if (node.type.name === 'table') {
      attrs = node.attrs;
      return false;
    }
    return true;
  });
  if (!attrs) throw new Error('test document has no table');
  return attrs;
}

function lastTableAttrs(doc: ReturnType<typeof schema.node>): Record<string, unknown> {
  let attrs: Record<string, unknown> | undefined;
  doc.descendants((node) => {
    if (node.type.name === 'table') {
      attrs = node.attrs;
    }
    return true;
  });
  if (!attrs) throw new Error('test document has no table');
  return attrs;
}

function firstRowCellAttrs(doc: ReturnType<typeof schema.node>): Array<Record<string, unknown>> {
  const cells: Array<Record<string, unknown>> = [];
  doc.descendants((node) => {
    if (node.type.name === 'tableRow') {
      node.forEach((cell) => cells.push(cell.attrs));
      return false;
    }
    return true;
  });
  return cells;
}

describe('TableExtension column commands', () => {
  test('deleteRow removes the table when deleting its only row', () => {
    const doc = runTableCommand(makeFixedWidthTableDoc(), 'deleteRow');

    expect(tableCount(doc)).toBe(0);
    expect(topLevelBlockTypes(doc)).toEqual(['paragraph']);
  });

  test('addColumnRight preserves fixed table width instead of inheriting stale colwidths', () => {
    const widths = firstRowColwidths(runTableCommand(makeFixedWidthTableDoc(), 'addColumnRight'));

    expect(widths.length).toBe(3);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(360);
  });

  test('addColumnLeft preserves fixed table width instead of inheriting stale colwidths', () => {
    const widths = firstRowColwidths(runTableCommand(makeFixedWidthTableDoc(), 'addColumnLeft'));

    expect(widths.length).toBe(3);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(360);
  });

  test('deleteColumn preserves fixed table width across remaining columns', () => {
    const widths = firstRowColwidths(runTableCommand(makeFixedWidthTableDoc(), 'deleteColumn'));

    expect(widths).toEqual([360]);
  });

  test('addColumnRight does not convert percentage tables into fixed-width tables', () => {
    const attrs = firstTableAttrs(runTableCommand(makePercentWidthTableDoc(), 'addColumnRight'));

    expect(attrs.width).toBe(5000);
    expect(attrs.widthType).toBe('pct');
    expect(attrs.columnWidths).toBeFalsy();
  });

  test('addColumnRight redistributes percentage cell widths across the full table width', () => {
    const cells = firstRowCellAttrs(runTableCommand(makePercentWidthTableDoc(), 'addColumnRight'));

    expect(cells.map((cell) => cell.widthType)).toEqual(['pct', 'pct', 'pct']);
    expect(cells.map((cell) => cell.width)).toEqual([33, 33, 34]);
  });

  test('addColumnLeft redistributes percentage cell widths across the full table width', () => {
    const cells = firstRowCellAttrs(runTableCommand(makePercentWidthTableDoc(), 'addColumnLeft'));

    expect(cells.map((cell) => cell.widthType)).toEqual(['pct', 'pct', 'pct']);
    expect(cells.map((cell) => cell.width)).toEqual([33, 33, 34]);
  });

  test('deleteColumn redistributes percentage cell widths across the full table width', () => {
    const cells = firstRowCellAttrs(
      runTableCommand(makeThreeColumnPercentWidthTableDoc(), 'deleteColumn')
    );

    expect(cells.map((cell) => cell.widthType)).toEqual(['pct', 'pct']);
    expect(cells.map((cell) => cell.width)).toEqual([50, 50]);
  });

  test('addColumnRight clears stale tblGrid when preserving percentage table semantics', () => {
    const attrs = firstTableAttrs(
      runTableCommand(makePercentWidthTableWithGridDoc(), 'addColumnRight')
    );

    expect(attrs.width).toBe(5000);
    expect(attrs.widthType).toBe('pct');
    expect(attrs.columnWidths).toBeNull();
  });

  test('addColumnRight clears stale tblGrid when preserving auto table semantics', () => {
    const attrs = firstTableAttrs(runTableCommand(makeAutoWidthTableWithGridDoc(), 'addColumnRight'));

    expect(attrs.width).toBe(null);
    expect(attrs.widthType).toBe('auto');
    expect(attrs.columnWidths).toBeNull();
  });

  test('addColumnLeft clears stale tblGrid when preserving percentage table semantics', () => {
    const attrs = firstTableAttrs(runTableCommand(makePercentWidthTableWithGridDoc(), 'addColumnLeft'));

    expect(attrs.width).toBe(5000);
    expect(attrs.widthType).toBe('pct');
    expect(attrs.columnWidths).toBeNull();
  });

  test('deleteColumn clears stale tblGrid when preserving percentage table semantics', () => {
    const attrs = firstTableAttrs(runTableCommand(makePercentWidthTableWithGridDoc(), 'deleteColumn'));

    expect(attrs.width).toBe(5000);
    expect(attrs.widthType).toBe('pct');
    expect(attrs.columnWidths).toBeNull();
  });

  test('resize normalizer does not convert percentage tables with tblGrid into dxa tables', () => {
    const doc = applyColwidthOnlyResizeTransaction(makePercentWidthTableWithGridDoc(), 220);
    const attrs = firstTableAttrs(doc);

    expect(attrs.width).toBe(5000);
    expect(attrs.widthType).toBe('pct');
    expect(attrs.columnWidths).toEqual([1800, 3600]);
    expect(firstRowColwidths(doc)).toEqual([220, 240]);
  });

  test('addColumnRight uses logical column count when fixed tables contain colspans', () => {
    const attrs = firstTableAttrs(runTableCommand(makeColspanTableDoc(), 'addColumnRight'));

    expect(attrs.columnWidths).toEqual([1800, 1800, 1800]);
  });

  test('addColumnLeft uses logical column count when fixed tables contain colspans', () => {
    const attrs = firstTableAttrs(runTableCommand(makeColspanTableDoc(), 'addColumnLeft'));

    expect(attrs.columnWidths).toEqual([1800, 1800, 1800]);
  });

  test('deleteColumn uses logical column count when fixed tables contain colspans', () => {
    const attrs = firstTableAttrs(runTableCommand(makeColspanTableDoc(), 'deleteColumn'));

    expect(attrs.columnWidths).toEqual([5400]);
  });

  test('fixed table resize preserves total width by compensating untouched columns', () => {
    const doc = applyResizeTransaction(makeHeaderLikeFixedWidthTableDoc(), 335);
    const widths = firstRowColwidths(doc);

    expect(widths).toEqual([335, 267]);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(602);
  });

  test('addColumnRight preserves exact non-divisible fixed table width', () => {
    const attrs = firstTableAttrs(runTableCommand(makeNonDivisibleFixedWidthTableDoc(), 'addColumnRight'));
    const columnWidths = attrs.columnWidths as number[];

    expect(columnWidths).toHaveLength(4);
    expect(columnWidths.reduce((sum, width) => sum + width, 0)).toBe(8504);
    expect(firstRowColwidths(runTableCommand(makeNonDivisibleFixedWidthTableDoc(), 'addColumnRight'))).toHaveLength(4);
  });

  test('insertTable creates a top-level percent table sized by the editor width', () => {
    const doc = runInsertTableCommand(makeEmptyParagraphDoc());
    const attrs = firstTableAttrs(doc);
    const cells = firstRowCellAttrs(doc);

    expect(attrs.width).toBe(5000);
    expect(attrs.widthType).toBe('pct');
    expect(attrs.columnWidths).toBeFalsy();
    expect(cells.map((cell) => cell.width)).toEqual([50, 50]);
    expect(cells.map((cell) => cell.widthType)).toEqual(['pct', 'pct']);
  });

  test('insertTable replaces an empty placeholder paragraph instead of leaving it before the table', () => {
    const doc = runInsertTableCommand(makeEmptyParagraphDoc());

    expect(topLevelBlockTypes(doc)).toEqual(['table', 'paragraph']);
  });

  test('insertTable places the selection inside the first inserted cell paragraph', () => {
    const tr = runInsertTableTransaction(makeEmptyParagraphDoc());

    expect(tr.selection.$from.parent.type.name).toBe('paragraph');
    expect(tr.selection.$from.node(-1).type.name).toBe('tableCell');
  });

  test('insertTable inside a dxa cell creates a nested dxa table from the parent cell width', () => {
    const doc = runInsertTableCommand(makeFixedWidthTableDoc());
    const attrs = lastTableAttrs(doc);

    expect(attrs.width).toBe(1584);
    expect(attrs.widthType).toBe('dxa');
    expect(attrs.columnWidths).toEqual([792, 792]);
  });

  test('insertTable inside a pct cell does not invent a dxa width from pct units', () => {
    const doc = runInsertTableCommand(makePercentWidthTableDoc());
    const attrs = lastTableAttrs(doc);
    const cells = firstRowCellAttrs(doc).slice(-2);

    expect(attrs.width).toBe(5000);
    expect(attrs.widthType).toBe('pct');
    expect(attrs.columnWidths).toBeFalsy();
    expect(cells.map((cell) => cell.width)).toEqual([50, 50]);
    expect(cells.map((cell) => cell.widthType)).toEqual(['pct', 'pct']);
  });
});
