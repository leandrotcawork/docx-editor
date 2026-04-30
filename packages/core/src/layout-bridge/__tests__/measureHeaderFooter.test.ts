import { describe, expect, test } from 'bun:test';
import { measureHeaderFooter } from '../measureHeaderFooter';
import type { HeaderFooter, Paragraph, Table } from '../../types/document';

function emptyParagraph(): Paragraph {
  return {
    type: 'paragraph',
    content: [],
  };
}

function emptyIdentifiedParagraph(id: string): Paragraph {
  return {
    ...emptyParagraph(),
    paraId: id,
  };
}

function twoCellTable(): Table {
  return {
    type: 'table',
    columnWidths: [1800, 1800],
    rows: [
      {
        type: 'tableRow',
        cells: [
          {
            type: 'tableCell',
            content: [emptyParagraph()],
          },
          {
            type: 'tableCell',
            content: [emptyParagraph()],
          },
        ],
      },
    ],
  };
}

function percentageCellTable(): Table {
  return {
    type: 'table',
    rows: [
      {
        type: 'tableRow',
        cells: [
          {
            type: 'tableCell',
            formatting: {
              width: { value: 2500, type: 'pct' },
              margins: {
                left: { value: 500, type: 'pct' },
                right: { value: 500, type: 'pct' },
              },
            },
            content: [emptyParagraph()],
          },
          {
            type: 'tableCell',
            formatting: {
              width: { value: 2500, type: 'pct' },
            },
            content: [emptyParagraph()],
          },
        ],
      },
    ],
  };
}

describe('measureHeaderFooter', () => {
  for (const type of ['header', 'footer'] as const) {
    test(`preserves and measures table content in ${type}s`, () => {
      const header: HeaderFooter = {
        type,
        hdrFtrType: 'default',
        content: [twoCellTable()],
      };

      const result = measureHeaderFooter(header, { maxWidth: 480 });

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]?.kind).toBe('table');
      expect(result.measures).toHaveLength(1);
      expect(result.measures[0]?.kind).toBe('table');
      expect(result.totalHeight).toBeGreaterThan(0);
    });
  }

  test('preserves mixed paragraph/table order when measuring header content', () => {
    const header: HeaderFooter = {
      type: 'header',
      hdrFtrType: 'default',
      content: [emptyIdentifiedParagraph('before'), twoCellTable(), emptyIdentifiedParagraph('after')],
    };

    const result = measureHeaderFooter(header, { maxWidth: 480 });

    expect(result.blocks.map((block) => block.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(result.measures.map((measure) => measure.kind)).toEqual([
      'paragraph',
      'table',
      'paragraph',
    ]);
    expect(result.totalHeight).toBeGreaterThan(0);
  });

  test('resolves percentage cell widths and margins against header/footer content width', () => {
    const header: HeaderFooter = {
      type: 'header',
      hdrFtrType: 'default',
      content: [percentageCellTable()],
    };

    const result = measureHeaderFooter(header, { maxWidth: 480 });
    const table = result.blocks[0];

    expect(table?.kind).toBe('table');
    if (table?.kind === 'table') {
      const firstCell = table.rows[0]?.cells[0];
      const secondCell = table.rows[0]?.cells[1];

      expect(firstCell?.width).toBe(240);
      expect(firstCell?.padding?.left).toBe(48);
      expect(firstCell?.padding?.right).toBe(48);
      expect(secondCell?.width).toBe(240);
    }
  });
});
