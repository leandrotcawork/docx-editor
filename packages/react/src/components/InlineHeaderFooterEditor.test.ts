import { describe, expect, test } from 'bun:test';
import { CellSelection, schema } from '@eigenpal/docx-core/prosemirror';
import {
  createTableCellSelectionFromElement,
  getTableCellSelectionPositions,
} from './InlineHeaderFooterEditor';

function makeOneCellTableDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(null, [
      schema.nodes.tableRow.create(null, [
        schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, schema.text('A'))),
      ]),
    ]),
  ]);
}

function firstCellPos(doc: ReturnType<typeof schema.node>) {
  let pos: number | undefined;
  doc.descendants((node, nodePos) => {
    if (pos == null && node.type.name === 'tableCell') {
      pos = nodePos;
      return false;
    }
    return true;
  });
  if (pos == null) throw new Error('test document has no table cell');
  return pos;
}

describe('getTableCellSelectionPositions', () => {
  test('keeps the direct td DOM position as a CellSelection candidate', () => {
    const cell = {} as HTMLElement;
    const view = {
      posAtDOM: () => 7,
      state: {
        doc: {
          resolve: () => ({
            depth: 1,
            node: () => ({ type: { name: 'tableRow' } }),
            before: () => 3,
          }),
        },
      },
    };

    expect(getTableCellSelectionPositions(view as never, cell)).toEqual([7]);
  });

  test('adds the resolved table cell boundary when available', () => {
    const cell = {} as HTMLElement;
    const view = {
      posAtDOM: () => 9,
      state: {
        doc: {
          resolve: () => ({
            depth: 2,
            node: (depth: number) => ({
              type: { name: depth === 2 ? 'tableCell' : 'tableRow' },
            }),
            before: () => 8,
          }),
        },
      },
    };

    expect(getTableCellSelectionPositions(view as never, cell)).toEqual([9, 8]);
  });
});

describe('createTableCellSelectionFromElement', () => {
  test('creates a native CellSelection from a real table cell position', () => {
    const doc = makeOneCellTableDoc();
    const cellPos = firstCellPos(doc);
    const cell = {} as HTMLElement;
    const view = {
      posAtDOM: () => cellPos,
      state: { doc },
    };

    const selection = createTableCellSelectionFromElement(view as never, cell);

    expect(selection).toBeInstanceOf(CellSelection);
    expect(selection?.$anchorCell.pos).toBe(cellPos);
  });
});
