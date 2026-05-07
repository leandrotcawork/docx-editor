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
  const changed =
    previousWidths?.length === currentWidths.length
      ? currentWidths
          .map((width, index) => (width !== previousWidths[index] ? index : -1))
          .filter((index) => index !== -1)
      : [];

  if (changed.length === 1) {
    const changedIndex = changed[0];
    const result = [...currentWidths];
    const fixedWidth = Math.min(
      Math.max(minWidth, currentWidths[changedIndex]),
      targetTotal - minWidth * (currentWidths.length - 1)
    );
    result[changedIndex] = fixedWidth;

    const remainingIndexes = result
      .map((_, index) => index)
      .filter((index) => index !== changedIndex);
    const remainingTotal = targetTotal - fixedWidth;
    const previousRemainingTotal = remainingIndexes.reduce(
      (sum, index) => sum + (previousWidths?.[index] ?? currentWidths[index]),
      0
    );

    let assigned = 0;
    remainingIndexes.forEach((index, offset) => {
      const isLast = offset === remainingIndexes.length - 1;
      const nextWidth = isLast
        ? remainingTotal - assigned
        : Math.max(
            minWidth,
            Math.round(
              remainingTotal *
                ((previousWidths?.[index] ?? currentWidths[index]) / previousRemainingTotal)
            )
          );
      result[index] = nextWidth;
      assigned += nextWidth;
    });

    return result;
  }

  let assigned = 0;
  return currentWidths.map((width, index) => {
    if (index === currentWidths.length - 1) return targetTotal - assigned;
    const nextWidth = Math.max(minWidth, Math.round((width / currentTotal) * targetTotal));
    assigned += nextWidth;
    return nextWidth;
  });
}
