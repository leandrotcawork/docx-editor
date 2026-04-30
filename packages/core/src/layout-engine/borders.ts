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

export function tableCellTopBorderHeight(cell: TableCell | undefined): number {
  return borderStrokeWidth(cell?.borders?.top);
}

export function tableRowTopBorderHeight(cells: TableCell[] | undefined): number {
  if (!cells) return 0;
  return cells.reduce((height, cell) => Math.max(height, tableCellTopBorderHeight(cell)), 0);
}
