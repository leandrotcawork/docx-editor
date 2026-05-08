import type { Node as PMNode } from 'prosemirror-model';

export function distributeEvenly(total: number, count: number): number[] {
  const safeCount = Math.max(1, count);
  const base = Math.floor(total / safeCount);
  const widths = Array(safeCount).fill(base);
  widths[widths.length - 1] += total - base * safeCount;
  return widths;
}

export function distributeTwipsFromPixelWeights(
  widthsPx: number[],
  totalTwips: number
): number[] {
  const totalPx = widthsPx.reduce((sum, width) => sum + width, 0);
  if (!totalPx) return distributeEvenly(totalTwips, widthsPx.length);

  let assigned = 0;
  return widthsPx.map((width, index) => {
    if (index === widthsPx.length - 1) return totalTwips - assigned;
    const nextWidth = Math.max(1, Math.round((width / totalPx) * totalTwips));
    assigned += nextWidth;
    return nextWidth;
  });
}

export function getLogicalColumnCount(table: PMNode): number {
  let columnCount = 0;
  table.forEach((row) => {
    if (row.type.name === 'tableRow') {
      let rowColumnCount = 0;
      row.forEach((cell) => {
        rowColumnCount += (cell.attrs.colspan as number) || 1;
      });
      columnCount = Math.max(columnCount, rowColumnCount);
    }
  });
  return columnCount;
}

export function getCellColumnStartIndexes(table: PMNode): number[][] {
  const rowStarts: number[][] = [];
  const occupiedByRowspan: number[] = [];

  table.forEach((row) => {
    if (row.type.name !== 'tableRow') return;

    const starts: number[] = [];
    let columnIndex = 0;
    row.forEach((cell) => {
      while ((occupiedByRowspan[columnIndex] ?? 0) > 0) columnIndex++;

      starts.push(columnIndex);
      const colspan = (cell.attrs.colspan as number) || 1;
      const rowspan = (cell.attrs.rowspan as number) || 1;
      if (rowspan > 1) {
        for (let offset = 0; offset < colspan; offset++) {
          occupiedByRowspan[columnIndex + offset] = Math.max(
            occupiedByRowspan[columnIndex + offset] ?? 0,
            rowspan
          );
        }
      }
      columnIndex += colspan;
    });

    rowStarts.push(starts);
    for (let i = 0; i < occupiedByRowspan.length; i++) {
      occupiedByRowspan[i] = Math.max(0, (occupiedByRowspan[i] ?? 0) - 1);
    }
  });

  return rowStarts;
}

export function getFirstRowColwidths(table: PMNode): number[] | null {
  const firstRow = table.firstChild;
  if (!firstRow || firstRow.type.name !== 'tableRow') return null;

  const widths: number[] = [];
  firstRow.forEach((cell) => {
    const colwidth = cell.attrs.colwidth as number[] | null;
    if (!colwidth?.length) return;
    widths.push(...colwidth);
  });

  return widths.length === getLogicalColumnCount(table) ? widths : null;
}

export function getFixedTableTargetPx(table: PMNode): number | null {
  if (table.attrs.widthType === 'dxa' && typeof table.attrs.width === 'number') {
    return Math.round(table.attrs.width / 15);
  }
  return null;
}

function getSafeMinimumWidth(targetTotal: number, columnCount: number, preferredMinWidth: number): number {
  if (columnCount <= 0) return 1;
  return Math.max(1, Math.min(preferredMinWidth, Math.floor(targetTotal / columnCount)));
}

function distributeWithMinimum(
  weights: number[],
  targetTotal: number,
  preferredMinWidth: number
): number[] {
  if (weights.length === 0) return [];

  const minWidth = getSafeMinimumWidth(targetTotal, weights.length, preferredMinWidth);
  const positiveWeights = weights.map((weight) => Math.max(0, weight));
  let remainingWeight = positiveWeights.reduce((sum, weight) => sum + weight, 0);
  let remainingTotal = targetTotal;

  return positiveWeights.map((weight, index) => {
    const remainingColumns = positiveWeights.length - index;
    const reservedForRest = minWidth * (remainingColumns - 1);
    const maxCurrent = Math.max(minWidth, remainingTotal - reservedForRest);

    if (index === positiveWeights.length - 1) return remainingTotal;

    const proportional =
      remainingWeight > 0
        ? Math.round((weight / remainingWeight) * remainingTotal)
        : Math.round(remainingTotal / remainingColumns);
    const nextWidth = Math.min(maxCurrent, Math.max(minWidth, proportional));
    remainingTotal -= nextWidth;
    remainingWeight -= weight;
    return nextWidth;
  });
}

export function normalizeFixedResizeWidths(
  previousWidths: number[] | null,
  currentWidths: number[],
  targetTotal: number
): number[] | null {
  const currentTotal = currentWidths.reduce((sum, width) => sum + width, 0);
  if (currentTotal === targetTotal) return null;
  if (
    previousWidths?.length === currentWidths.length &&
    currentWidths.every((width, index) => width === previousWidths[index])
  ) {
    return null;
  }

  const minWidth = 25;
  const safeMinWidth = getSafeMinimumWidth(targetTotal, currentWidths.length, minWidth);
  const changed =
    previousWidths?.length === currentWidths.length
      ? currentWidths
          .map((width, index) => (width !== previousWidths[index] ? index : -1))
          .filter((index) => index !== -1)
      : [];

  if (changed.length === 1) {
    const changedIndex = changed[0];
    const result = [...currentWidths];
    const maxChangedWidth = Math.max(
      safeMinWidth,
      targetTotal - safeMinWidth * (currentWidths.length - 1)
    );
    const fixedWidth = Math.min(
      Math.max(safeMinWidth, currentWidths[changedIndex]),
      maxChangedWidth
    );
    result[changedIndex] = fixedWidth;

    const remainingIndexes = result
      .map((_, index) => index)
      .filter((index) => index !== changedIndex);
    const remainingTotal = targetTotal - fixedWidth;
    const remainingWeights = remainingIndexes.map(
      (index) => previousWidths?.[index] ?? currentWidths[index]
    );
    const normalizedRemainingWidths = distributeWithMinimum(
      remainingWeights,
      remainingTotal,
      safeMinWidth
    );

    remainingIndexes.forEach((index, offset) => {
      result[index] = normalizedRemainingWidths[offset];
    });

    return result;
  }

  return distributeWithMinimum(currentWidths, targetTotal, safeMinWidth);
}
