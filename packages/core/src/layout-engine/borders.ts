import type { BorderStyle, ParagraphBorders, TableCell } from './types';

export function borderStrokeWidth(border: { width?: number } | undefined): number {
  return border?.width ?? 0;
}

export function paragraphBorderPadding(
  border: BorderStyle | undefined,
  fallback: number
): number {
  if (!border) return 0;
  return border.space ?? fallback;
}

export function paragraphBorderExtent(
  border: BorderStyle | undefined,
  fallbackPadding: number
): number {
  if (!border) return 0;
  return paragraphBorderPadding(border, fallbackPadding) + borderStrokeWidth(border);
}

export function hasParagraphBorder(borders: ParagraphBorders | undefined): boolean {
  if (!borders) return false;
  return Boolean(borders.top || borders.bottom || borders.left || borders.right || borders.between);
}

export function paragraphBordersEqual(
  a: BorderStyle | undefined,
  b: BorderStyle | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.style === b.style && a.width === b.width && a.color === b.color;
}

export function paragraphBordersFormGroup(
  a: ParagraphBorders | undefined,
  b: ParagraphBorders | undefined
): boolean {
  if (!a && !b) return false;
  if (!a || !b) return false;
  return (
    paragraphBordersEqual(a.top, b.top) &&
    paragraphBordersEqual(a.bottom, b.bottom) &&
    paragraphBordersEqual(a.left, b.left) &&
    paragraphBordersEqual(a.right, b.right) &&
    paragraphBordersEqual(a.between, b.between)
  );
}

export function renderedParagraphBorderBoxHeight(
  borders: ParagraphBorders | undefined,
  prevBorders: ParagraphBorders | undefined,
  nextBorders: ParagraphBorders | undefined,
  includeTop: boolean,
  includeBottom: boolean
): number {
  if (!hasParagraphBorder(borders)) return 0;

  const groupedWithPrev = paragraphBordersFormGroup(prevBorders, borders);
  const groupedWithNext = paragraphBordersFormGroup(borders, nextBorders);
  let height = 0;

  if (includeTop) {
    const topPaddingBorder = borders?.top ?? borders?.between;
    if (topPaddingBorder) {
      height += paragraphBorderPadding(topPaddingBorder, 2);
    }
    if (groupedWithPrev && borders?.between) {
      height += borderStrokeWidth(borders.between);
    } else if (borders?.top && !groupedWithPrev) {
      height += borderStrokeWidth(borders.top);
    }
  }

  if (includeBottom && borders?.bottom) {
    height += paragraphBorderPadding(borders.bottom, 6);
    if (!groupedWithNext) {
      height += borderStrokeWidth(borders.bottom);
    }
  }

  return height;
}

export function tableCellTopBorderHeight(cell: TableCell | undefined): number {
  return borderStrokeWidth(cell?.borders?.top);
}

export function tableRowTopBorderHeight(cells: TableCell[] | undefined): number {
  if (!cells) return 0;
  return cells.reduce((height, cell) => Math.max(height, tableCellTopBorderHeight(cell)), 0);
}
