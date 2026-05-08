import { describe, expect, test } from 'bun:test';
import {
  distributeTwipsFromPixelWeights,
  getCellColumnStartIndexes,
  normalizeFixedResizeWidths,
} from './tableFixedResizeUtils';
import { schema } from '../../schema';

describe('normalizeFixedResizeWidths', () => {
  test('preserves the table total when one fixed-width column changes', () => {
    const previous = [280, 322];
    const current = [240, 322];

    expect(normalizeFixedResizeWidths(previous, current, 602)).toEqual([240, 362]);
  });

  test('keeps narrow fixed-width tables positive while preserving the total', () => {
    const previous = [12, 12, 12];
    const current = [4, 12, 12];
    const normalized = normalizeFixedResizeWidths(previous, current, 36);

    expect(normalized).toEqual([12, 12, 12]);
    expect(normalized?.reduce((sum, width) => sum + width, 0)).toBe(36);
    expect(normalized?.every((width) => width > 0)).toBe(true);
  });

  test('returns null when total width already matches the target', () => {
    expect(normalizeFixedResizeWidths([280, 322], [280, 322], 602)).toBeNull();
  });

  test('does not normalize when widths did not change in the current transaction', () => {
    expect(normalizeFixedResizeWidths([280, 322], [280, 322], 600)).toBeNull();
  });

  test('preserves total and positive widths when multiple columns change', () => {
    const normalized = normalizeFixedResizeWidths([12, 12, 12], [4, 20, 20], 36);

    expect(normalized).toEqual([12, 12, 12]);
    expect(normalized?.reduce((sum, width) => sum + width, 0)).toBe(36);
    expect(normalized?.every((width) => width > 0)).toBe(true);
  });
});

describe('distributeTwipsFromPixelWeights', () => {
  test('keeps the twips total while mirroring pixel proportions', () => {
    const widthsTwips = distributeTwipsFromPixelWeights([240, 362], 9030);
    expect(widthsTwips.reduce((sum, width) => sum + width, 0)).toBe(9030);
  });

  test('keeps the twips total for narrow pixel widths', () => {
    const widthsTwips = distributeTwipsFromPixelWeights([4, 16, 16], 540);
    expect(widthsTwips).toEqual([60, 240, 240]);
    expect(widthsTwips.reduce((sum, width) => sum + width, 0)).toBe(540);
  });
});

describe('getCellColumnStartIndexes', () => {
  test('skips logical columns occupied by rowspan cells', () => {
    const paragraph = schema.nodes.paragraph.create();
    const table = schema.nodes.table.create(
      { width: 9030, widthType: 'dxa', columnWidths: [3010, 3010, 3010] },
      [
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create({ rowspan: 2, colspan: 1 }, paragraph),
          schema.nodes.tableCell.create({ colspan: 1 }, paragraph),
          schema.nodes.tableCell.create({ colspan: 1 }, paragraph),
        ]),
        schema.nodes.tableRow.create(null, [
          schema.nodes.tableCell.create({ colspan: 1 }, paragraph),
          schema.nodes.tableCell.create({ colspan: 1 }, paragraph),
        ]),
      ]
    );

    expect(getCellColumnStartIndexes(table)).toEqual([
      [0, 1, 2],
      [1, 2],
    ]);
  });
});
