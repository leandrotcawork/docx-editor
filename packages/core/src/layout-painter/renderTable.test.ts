import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import type { TableBlock, TableFragment, TableMeasure } from '../layout-engine/types';
import { renderTableFragment } from './renderTable';

const renderContext = {
  pageNumber: 1,
  totalPages: 1,
  section: 'body' as const,
  contentWidth: 200,
};

function makeContinuationTable(): {
  block: TableBlock;
  measure: TableMeasure;
  fragment: TableFragment;
} {
  const borderedCell = {
    blocks: [],
    borders: {
      top: { width: 2, style: 'solid', color: '#000000' },
      bottom: { width: 1, style: 'solid', color: '#000000' },
    },
  };

  return {
    block: {
      kind: 'table',
      id: 'table',
      rows: [
        { id: 'row-0', cells: [{ ...borderedCell, id: 'cell-0' }] },
        { id: 'row-1', cells: [{ ...borderedCell, id: 'cell-1' }] },
        { id: 'row-2', cells: [{ ...borderedCell, id: 'cell-2' }] },
      ],
    },
    measure: {
      kind: 'table',
      columnWidths: [200],
      totalWidth: 200,
      totalHeight: 210,
      rows: [
        { height: 70, cells: [{ width: 200, height: 70, blocks: [] }] },
        { height: 70, cells: [{ width: 200, height: 70, blocks: [] }] },
        { height: 70, cells: [{ width: 200, height: 70, blocks: [] }] },
      ],
    },
    fragment: {
      kind: 'table',
      blockId: 'table',
      x: 0,
      y: 0,
      width: 200,
      height: 142,
      fromRow: 1,
      toRow: 3,
      continuesFromPrev: true,
      startBorderHeight: 2,
    },
  };
}

describe('renderTableFragment continuation borders', () => {
  beforeAll(() => {
    GlobalRegistrator.register();
  });

  afterAll(() => {
    GlobalRegistrator.unregister();
  });

  test('applies continuation start border height to rows and resize handles', () => {
    const { block, measure, fragment } = makeContinuationTable();

    const tableEl = renderTableFragment(fragment, block, measure, renderContext);

    const rows = Array.from(tableEl.querySelectorAll('.layout-table-row')) as HTMLElement[];
    expect(rows.map((row) => row.style.height)).toEqual(['72px', '70px']);

    const rowHandle = tableEl.querySelector('.layout-table-row-resize-handle') as HTMLElement;
    expect(rowHandle.style.top).toBe('69px');

    const bottomHandle = tableEl.querySelector('.layout-table-edge-handle-bottom') as HTMLElement;
    expect(bottomHandle.style.top).toBe('139px');
  });
});
