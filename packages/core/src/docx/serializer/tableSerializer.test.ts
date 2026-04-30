import { describe, expect, test } from 'bun:test';
import { serializeTable } from './tableSerializer';
import type { Table, TableCell } from '../../types/document';

function cell(width: number): TableCell {
  return {
    type: 'tableCell',
    formatting: {
      width: { value: width, type: 'dxa' },
    },
    content: [{ type: 'paragraph', content: [] }],
  };
}

describe('serializeTable - table grid', () => {
  test('repairs partial columnWidths from first-row dxa cell widths', () => {
    const table: Table = {
      type: 'table',
      columnWidths: [null, null, 2805] as unknown as number[],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [cell(3541), cell(2157), cell(2806)],
        },
      ],
    };

    const xml = serializeTable(table);

    expect(xml).toContain('<w:gridCol w:w="3541"/>');
    expect(xml).toContain('<w:gridCol w:w="2157"/>');
    expect(xml).toContain('<w:gridCol w:w="2806"/>');
    expect(xml).not.toContain('<w:gridCol w:w="null"/>');
  });

  test('derives tblGrid from a later complete row when the first row is merged', () => {
    const mergedCell = cell(5698);
    const table: Table = {
      type: 'table',
      columnWidths: [null, null, 2805] as unknown as number[],
      formatting: {
        width: { value: 8504, type: 'dxa' },
      },
      rows: [
        {
          type: 'tableRow',
          cells: [
            {
              ...mergedCell,
              formatting: {
                ...mergedCell.formatting,
                gridSpan: 2,
              },
            },
            cell(2806),
          ],
        },
        {
          type: 'tableRow',
          cells: [cell(2806), cell(2892), cell(2806)],
        },
      ],
    };

    const xml = serializeTable(table);

    expect(xml).toContain('<w:gridCol w:w="2806"/>');
    expect(xml).toContain('<w:gridCol w:w="2892"/>');
    expect(xml).not.toContain('<w:gridCol w:w="null"/>');
  });
});
