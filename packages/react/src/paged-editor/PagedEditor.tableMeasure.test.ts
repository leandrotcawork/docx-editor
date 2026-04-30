import { describe, expect, test } from 'bun:test';
import type { TableBlock } from '@eigenpal/docx-core/layout-engine/types';
import { measureTableBlock } from './PagedEditor';

function makeTable(withBorders: boolean): TableBlock {
  return {
    kind: 'table',
    id: 'table',
    columnWidths: [200],
    rows: [0, 1].map((rowIndex) => ({
      id: `row-${rowIndex}`,
      cells: [
        {
          id: `cell-${rowIndex}`,
          blocks: [
            {
              kind: 'paragraph',
              id: `p-${rowIndex}`,
              runs: [],
            },
          ],
          padding: { top: 4, right: 0, bottom: 4, left: 0 },
          borders: withBorders
            ? {
                top: { width: 1, style: 'solid', color: '#000000' },
                bottom: { width: 1, style: 'solid', color: '#000000' },
              }
            : undefined,
        },
      ],
    })),
  };
}

describe('PagedEditor table measurement', () => {
  test('includes rendered vertical cell borders in row height', () => {
    const withoutBorders = measureTableBlock(makeTable(false), 200);
    const withBorders = measureTableBlock(makeTable(true), 200);

    expect(withBorders.rows[0].height).toBeCloseTo(withoutBorders.rows[0].height + 2, 5);
    expect(withBorders.rows[1].height).toBeCloseTo(withoutBorders.rows[1].height + 1, 5);
    expect(withBorders.totalHeight).toBeCloseTo(withoutBorders.totalHeight + 3, 5);
  });
});
