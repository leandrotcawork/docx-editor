import { describe, expect, test } from 'bun:test';
import { convertHeaderFooterToContent } from './headerFooterContent';
import type { HeaderFooter, Paragraph, Table } from '@eigenpal/docx-core/types/document';
import type { FlowBlock, Measure } from '@eigenpal/docx-core/layout-engine/types';

function emptyParagraph(): Paragraph {
  return {
    type: 'paragraph',
    content: [],
  };
}

function paragraphWithText(text: string): Paragraph {
  return {
    type: 'paragraph',
    content: [
      {
        type: 'run',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

function spacedParagraph(): Paragraph {
  return {
    type: 'paragraph',
    formatting: {
      spaceBefore: 120,
      spaceAfter: 60,
    },
    content: [
      {
        type: 'run',
        content: [{ type: 'text', text: 'separator' }],
      },
    ],
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
          { type: 'tableCell', content: [emptyParagraph()] },
          { type: 'tableCell', content: [emptyParagraph()] },
        ],
      },
    ],
  };
}

function tableWithTableBorders(): Table {
  return {
    type: 'table',
    formatting: {
      borders: {
        top: { style: 'single', size: 8, color: { rgb: 'auto' } },
        bottom: { style: 'single', size: 8, color: { rgb: 'auto' } },
        left: { style: 'single', size: 8, color: { rgb: 'auto' } },
        right: { style: 'single', size: 8, color: { rgb: 'auto' } },
      },
    },
    columnWidths: [1800, 1800],
    rows: [
      {
        type: 'tableRow',
        cells: [
          { type: 'tableCell', content: [emptyParagraph()] },
          { type: 'tableCell', content: [emptyParagraph()] },
        ],
      },
    ],
  };
}

describe('header/footer render content conversion', () => {
  test('preserves table blocks so the painter can render header and footer tables', () => {
    const headerFooter: HeaderFooter = {
      type: 'header',
      hdrFtrType: 'default',
      content: [twoCellTable()],
    };

    const measureBlocks = (blocks: FlowBlock[]): Measure[] =>
      blocks.map((block) =>
        block.kind === 'table'
          ? { kind: 'table', rows: [], columnWidths: [120, 120], totalWidth: 240, totalHeight: 24 }
          : { kind: 'paragraph', lines: [], totalHeight: 12 }
      );

    const result = convertHeaderFooterToContent(
      headerFooter,
      480,
      {
        section: 'header',
        pageSize: { w: 816, h: 1056 },
        margins: { top: 96, right: 96, bottom: 96, left: 96 },
      },
      measureBlocks
    );

    expect(result).toBeDefined();
    expect(result?.blocks).toHaveLength(1);
    expect(result?.blocks[0]?.kind).toBe('table');
    expect(result?.measures[0]?.kind).toBe('table');
    expect(result?.height).toBeGreaterThan(0);
  });

  test('keeps mixed paragraphs and tables in source order', () => {
    const headerFooter: HeaderFooter = {
      type: 'header',
      hdrFtrType: 'default',
      content: [paragraphWithText('before'), twoCellTable(), paragraphWithText('after')],
    };

    const measureBlocks = (blocks: FlowBlock[]): Measure[] =>
      blocks.map((block) =>
        block.kind === 'table'
          ? { kind: 'table', rows: [], columnWidths: [120, 120], totalWidth: 240, totalHeight: 24 }
          : { kind: 'paragraph', lines: [], totalHeight: 12 }
      );

    const result = convertHeaderFooterToContent(
      headerFooter,
      480,
      {
        section: 'header',
        pageSize: { w: 816, h: 1056 },
        margins: { top: 96, right: 96, bottom: 96, left: 96 },
      },
      measureBlocks
    );

    expect(result).toBeDefined();
    expect(result?.blocks.map((block) => block.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(result?.measures.map((measure) => measure.kind)).toEqual([
      'paragraph',
      'table',
      'paragraph',
    ]);
    expect(result?.height).toBe(48);
  });

  test('preserves paragraph spacing used by header/footer separator paragraphs', () => {
    const headerFooter: HeaderFooter = {
      type: 'header',
      hdrFtrType: 'default',
      content: [spacedParagraph()],
    };

    const result = convertHeaderFooterToContent(
      headerFooter,
      480,
      {
        section: 'header',
        pageSize: { w: 816, h: 1056 },
        margins: { top: 96, right: 96, bottom: 96, left: 96 },
      },
      (blocks) => blocks.map(() => ({ kind: 'paragraph', lines: [], totalHeight: 24 }))
    );

    const paragraph = result?.blocks[0];
    expect(paragraph?.kind).toBe('paragraph');
    if (paragraph?.kind === 'paragraph') {
      expect(paragraph.attrs?.spacing?.before).toBe(8);
      expect(paragraph.attrs?.spacing?.after).toBe(4);
    }
  });

  test('uses table-level borders for header/footer table cells when cell borders are absent', () => {
    const headerFooter: HeaderFooter = {
      type: 'header',
      hdrFtrType: 'default',
      content: [tableWithTableBorders()],
    };

    const result = convertHeaderFooterToContent(
      headerFooter,
      480,
      {
        section: 'header',
        pageSize: { w: 816, h: 1056 },
        margins: { top: 96, right: 96, bottom: 96, left: 96 },
      },
      (blocks) =>
        blocks.map((block) =>
          block.kind === 'table'
            ? {
                kind: 'table',
                rows: [],
                columnWidths: [120, 120],
                totalWidth: 240,
                totalHeight: 24,
              }
            : { kind: 'paragraph', lines: [], totalHeight: 12 }
        )
    );

    const table = result?.blocks[0];
    expect(table?.kind).toBe('table');
    if (table?.kind === 'table') {
      const firstCell = table.rows[0]?.cells[0];
      expect(firstCell?.borders?.top?.style).toBe('solid');
      expect(firstCell?.borders?.top?.color).toBe('#000000');
    }
  });
});
