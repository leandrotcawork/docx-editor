import type {
  FlowBlock,
  Measure,
  ParagraphBlock,
  CellBorders,
  TableBlock,
  ImageRun,
  PageMargins,
  Run,
  RunFormatting,
  ParagraphAttrs,
  ParagraphBorders,
  ParagraphSpacing,
} from '@eigenpal/docx-core/layout-engine/types';
import { convertBorderSpecToLayout } from '@eigenpal/docx-core/layout-bridge/toFlowBlocks';
import type { HeaderFooter } from '@eigenpal/docx-core/types/document';
import type { HeaderFooterContent } from '@eigenpal/docx-core/layout-painter/renderPage';

export type HeaderFooterMetrics = {
  section: 'header' | 'footer';
  pageSize: { w: number; h: number };
  margins: PageMargins;
};

export type HeaderFooterMeasureBlocks = (blocks: FlowBlock[], contentWidth: number) => Measure[];

function twipsToPixels(twips: number): number {
  return Math.round((twips / 1440) * 96);
}

function emuToPixels(emu: number | undefined): number {
  if (emu === undefined) return 0;
  return Math.round((emu * 96) / 914400);
}

function convertDocumentRunsToFlowRuns(content: unknown[]): Run[] {
  const runs: Run[] = [];

  for (const item of content) {
    const itemObj = item as Record<string, unknown>;

    if (itemObj.type === 'run' && Array.isArray(itemObj.content)) {
      const formatting = itemObj.formatting as Record<string, unknown> | undefined;
      const runFormatting: RunFormatting = {};

      if (formatting) {
        if (formatting.bold) runFormatting.bold = true;
        if (formatting.italic) runFormatting.italic = true;
        if (formatting.underline) runFormatting.underline = true;
        if (formatting.strike) runFormatting.strike = true;
        if (formatting.color) {
          const color = formatting.color as Record<string, unknown>;
          if (color.val) runFormatting.color = `#${color.val}`;
          else if (color.rgb) runFormatting.color = `#${color.rgb}`;
        }
        if (formatting.fontSize) {
          runFormatting.fontSize = (formatting.fontSize as number) / 2;
        }
        if (formatting.fontFamily) {
          const ff = formatting.fontFamily as Record<string, unknown>;
          runFormatting.fontFamily = (ff.ascii || ff.hAnsi) as string;
        }
      }

      for (const runContent of itemObj.content as unknown[]) {
        const rc = runContent as Record<string, unknown>;

        if (rc.type === 'text' && typeof rc.text === 'string') {
          runs.push({ kind: 'text', text: rc.text, ...runFormatting });
        } else if (rc.type === 'tab') {
          runs.push({ kind: 'tab', ...runFormatting });
        } else if (rc.type === 'break') {
          runs.push({ kind: 'lineBreak' });
        } else if (rc.type === 'drawing' && rc.image) {
          const image = rc.image as Record<string, unknown>;
          const size = image.size as { width: number; height: number } | undefined;
          const widthPx = size?.width ? emuToPixels(size.width) : 100;
          const heightPx = size?.height ? emuToPixels(size.height) : 100;
          const position = image.position as
            | {
                horizontal?: { relativeTo?: string; posOffset?: number; align?: string };
                vertical?: { relativeTo?: string; posOffset?: number; align?: string };
              }
            | undefined;

          runs.push({
            kind: 'image',
            src: (image.src as string) || '',
            width: widthPx,
            height: heightPx,
            alt: (image.alt as string) || undefined,
            position: position
              ? {
                  horizontal: position.horizontal,
                  vertical: position.vertical,
                }
              : undefined,
          } as Run);
        }
      }
    }

    if (itemObj.type === 'simpleField') {
      const fieldType = itemObj.fieldType as string;
      const fieldFormatting = extractFieldFormatting(itemObj.content as unknown[] | undefined);

      if (fieldType === 'PAGE') {
        runs.push({ kind: 'field', fieldType: 'PAGE', fallback: '1', ...fieldFormatting });
      } else if (fieldType === 'NUMPAGES') {
        runs.push({ kind: 'field', fieldType: 'NUMPAGES', fallback: '1', ...fieldFormatting });
      } else if (Array.isArray(itemObj.content)) {
        runs.push(...convertDocumentRunsToFlowRuns(itemObj.content as unknown[]));
      }
      continue;
    }

    if (itemObj.type === 'complexField') {
      const fieldType = itemObj.fieldType as string;
      const fieldFormatting = extractFieldFormatting(itemObj.fieldResult as unknown[] | undefined);

      if (fieldType === 'PAGE') {
        runs.push({ kind: 'field', fieldType: 'PAGE', fallback: '1', ...fieldFormatting });
      } else if (fieldType === 'NUMPAGES') {
        runs.push({ kind: 'field', fieldType: 'NUMPAGES', fallback: '1', ...fieldFormatting });
      } else if (Array.isArray(itemObj.fieldResult)) {
        runs.push(...convertDocumentRunsToFlowRuns(itemObj.fieldResult as unknown[]));
      }
    }

    if (itemObj.type === 'hyperlink' && Array.isArray(itemObj.children)) {
      runs.push(...convertDocumentRunsToFlowRuns(itemObj.children as unknown[]));
    }
  }

  return runs;
}

function extractFieldFormatting(content: unknown[] | undefined): RunFormatting {
  const fieldFormatting: RunFormatting = {};
  if (!Array.isArray(content) || content.length === 0) return fieldFormatting;

  const firstRun = content[0] as Record<string, unknown>;
  if (firstRun?.type !== 'run' || !firstRun.formatting) return fieldFormatting;

  const formatting = firstRun.formatting as Record<string, unknown>;
  if (formatting.fontSize) fieldFormatting.fontSize = (formatting.fontSize as number) / 2;
  if (formatting.fontFamily) {
    const ff = formatting.fontFamily as Record<string, unknown>;
    fieldFormatting.fontFamily = (ff.ascii || ff.hAnsi) as string;
  }
  if (formatting.bold) fieldFormatting.bold = true;
  if (formatting.italic) fieldFormatting.italic = true;
  if (formatting.color) {
    const c = formatting.color as Record<string, unknown>;
    const val = (c.rgb || c.val) as string | undefined;
    if (val) fieldFormatting.color = val.startsWith('#') ? val : `#${val}`;
  }

  return fieldFormatting;
}

type PositionedAxis = {
  relativeTo?: string;
  posOffset?: number;
  align?: string;
  alignment?: string;
};

function getPositionAlignment(axis: PositionedAxis | undefined): string | undefined {
  return axis?.align ?? axis?.alignment;
}

function resolveHeaderFooterVisualTop(
  run: ImageRun,
  paragraphY: number,
  flowHeight: number,
  metrics: HeaderFooterMetrics
): number {
  const flowTop =
    metrics.section === 'header'
      ? (metrics.margins.header ?? 48)
      : metrics.pageSize.h - (metrics.margins.footer ?? 48) - flowHeight;
  const vertical = run.position?.vertical;

  if (!vertical) return paragraphY;

  const align = getPositionAlignment(vertical);
  const offsetPx = vertical.posOffset !== undefined ? emuToPixels(vertical.posOffset) : undefined;

  if (vertical.relativeTo === 'page') {
    if (offsetPx !== undefined) return offsetPx - flowTop;
    if (align === 'top') return -flowTop;
    if (align === 'bottom') return metrics.pageSize.h - run.height - flowTop;
    if (align === 'center') return (metrics.pageSize.h - run.height) / 2 - flowTop;
  }

  if (vertical.relativeTo === 'margin') {
    const marginTop = metrics.margins.top;
    const marginHeight = metrics.pageSize.h - metrics.margins.top - metrics.margins.bottom;
    if (offsetPx !== undefined) return marginTop + offsetPx - flowTop;
    if (align === 'top') return marginTop - flowTop;
    if (align === 'bottom') return marginTop + marginHeight - run.height - flowTop;
    if (align === 'center') return marginTop + (marginHeight - run.height) / 2 - flowTop;
  }

  if (offsetPx !== undefined) return paragraphY + offsetPx;

  return paragraphY;
}

function calculateHeaderFooterVisualBounds(
  blocks: FlowBlock[],
  measures: Measure[],
  flowHeight: number,
  metrics: HeaderFooterMetrics
): { visualTop: number; visualBottom: number } {
  let visualTop = 0;
  let visualBottom = flowHeight;
  let cursorY = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const measure = measures[i];
    if (block?.kind !== 'paragraph' || measure?.kind !== 'paragraph') {
      if (measure && 'totalHeight' in measure) {
        visualBottom = Math.max(visualBottom, cursorY + measure.totalHeight);
        cursorY += measure.totalHeight;
      }
      continue;
    }

    const paragraphBlock = block as ParagraphBlock;
    const paragraphStartY = cursorY;
    const paragraphBottomY = paragraphStartY + measure.totalHeight;
    visualTop = Math.min(visualTop, paragraphStartY);
    visualBottom = Math.max(visualBottom, paragraphBottomY);

    for (const run of paragraphBlock.runs) {
      if (run.kind !== 'image' || !run.position) continue;
      const imageRun = run as ImageRun;
      const runTop = resolveHeaderFooterVisualTop(imageRun, paragraphStartY, flowHeight, metrics);
      visualTop = Math.min(visualTop, runTop);
      visualBottom = Math.max(visualBottom, runTop + imageRun.height);
    }

    cursorY = paragraphBottomY;
  }

  return { visualTop, visualBottom };
}

function convertHeaderFooterParagraphToFlowBlock(
  itemObj: Record<string, unknown>,
  id: string
): ParagraphBlock {
  const formatting = itemObj.formatting as Record<string, unknown> | undefined;
  const attrs: ParagraphAttrs = {};

  if (formatting) {
    if (formatting.alignment) {
      const align = formatting.alignment as string;
      if (align === 'both') attrs.alignment = 'justify';
      else if (['left', 'center', 'right', 'justify'].includes(align)) {
        attrs.alignment = align as 'left' | 'center' | 'right' | 'justify';
      }
    }
    if (formatting.borders) {
      const borders = formatting.borders as Record<string, unknown>;
      const converted: ParagraphBorders = {};
      for (const side of ['top', 'bottom', 'left', 'right', 'between'] as const) {
        const b = borders[side] as
          | { style?: string; size?: number; color?: Record<string, string> }
          | undefined;
        if (b) {
          const layoutBorder = convertBorderSpecToLayout(b);
          if (layoutBorder) converted[side] = layoutBorder;
        }
      }
      if (Object.keys(converted).length > 0) attrs.borders = converted;
    }
    if (
      formatting.spaceBefore != null ||
      formatting.spaceAfter != null ||
      formatting.lineSpacing != null
    ) {
      const spacingAttrs: ParagraphSpacing = {};
      if (formatting.spaceBefore != null) {
        spacingAttrs.before = twipsToPixels(formatting.spaceBefore as number);
      }
      if (formatting.spaceAfter != null) {
        spacingAttrs.after = twipsToPixels(formatting.spaceAfter as number);
      }
      if (formatting.lineSpacing != null) {
        const rule = formatting.lineSpacingRule as string | undefined;
        if (rule === 'exact' || rule === 'atLeast') {
          spacingAttrs.line = twipsToPixels(formatting.lineSpacing as number);
          spacingAttrs.lineUnit = 'px';
          spacingAttrs.lineRule = rule;
        } else {
          spacingAttrs.line = (formatting.lineSpacing as number) / 240;
          spacingAttrs.lineUnit = 'multiplier';
          spacingAttrs.lineRule = 'auto';
        }
      }
      attrs.spacing = spacingAttrs;
    }
    if (Array.isArray(formatting.tabs) && formatting.tabs.length > 0) {
      attrs.tabs = (
        formatting.tabs as Array<{ position: number; alignment: string; leader?: string }>
      ).map((tab) => {
        const align =
          tab.alignment === 'left' ? 'start' : tab.alignment === 'right' ? 'end' : tab.alignment;
        return {
          val: align as 'start' | 'end' | 'center' | 'decimal' | 'bar' | 'clear',
          pos: twipsToPixels(tab.position),
          leader: tab.leader as
            | 'none'
            | 'dot'
            | 'hyphen'
            | 'underscore'
            | 'heavy'
            | 'middleDot'
            | undefined,
        };
      });
    }
  }

  const runs = convertDocumentRunsToFlowRuns(itemObj.content as unknown[]);
  if (runs.length === 0) runs.push({ kind: 'text' as const, text: '' });

  return {
    kind: 'paragraph',
    id,
    runs,
    attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
  };
}

function tableMeasurementToPixels(
  measurement: { value: number; type: string } | undefined,
  availableWidth: number
): number | undefined {
  if (!measurement) return undefined;
  if (measurement.type === 'dxa') return twipsToPixels(measurement.value);
  if (measurement.type === 'pct') return (availableWidth * measurement.value) / 5000;
  return undefined;
}

function convertHeaderFooterCellBorders(
  borders: Record<string, unknown> | undefined
): CellBorders | undefined {
  if (!borders) return undefined;

  const converted: CellBorders = {};
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const border = borders[side] as
      | { style?: string; size?: number; color?: Record<string, string> }
      | undefined;
    converted[side] = border ? convertBorderSpecToLayout(border) : undefined;
  }

  return Object.values(converted).some(Boolean) ? converted : undefined;
}

function convertHeaderFooterCellPadding(
  cellFormatting: Record<string, unknown> | undefined,
  tableFormatting: Record<string, unknown> | undefined,
  availableWidth: number
): { top: number; right: number; bottom: number; left: number } {
  const margins =
    (cellFormatting?.margins as Record<string, { value: number; type: string }> | undefined) ??
    (tableFormatting?.cellMargins as Record<string, { value: number; type: string }> | undefined);

  return {
    top: tableMeasurementToPixels(margins?.top, availableWidth) ?? 0,
    right: tableMeasurementToPixels(margins?.right, availableWidth) ?? 7,
    bottom: tableMeasurementToPixels(margins?.bottom, availableWidth) ?? 0,
    left: tableMeasurementToPixels(margins?.left, availableWidth) ?? 7,
  };
}

function convertHeaderFooterItemsToFlowBlocks(
  content: unknown[],
  contentWidth: number,
  idPrefix: string
): FlowBlock[] {
  const blocks: FlowBlock[] = [];

  content.forEach((item, index) => {
    const itemObj = item as Record<string, unknown>;
    if (itemObj.type === 'paragraph' && Array.isArray(itemObj.content)) {
      blocks.push(convertHeaderFooterParagraphToFlowBlock(itemObj, `${idPrefix}-p-${index}`));
    } else if (itemObj.type === 'table' && Array.isArray(itemObj.rows)) {
      blocks.push(
        convertHeaderFooterTableToFlowBlock(itemObj, contentWidth, `${idPrefix}-t-${index}`)
      );
    }
  });

  return blocks;
}

function convertHeaderFooterTableToFlowBlock(
  itemObj: Record<string, unknown>,
  contentWidth: number,
  id: string
): TableBlock {
  const formatting = itemObj.formatting as Record<string, unknown> | undefined;
  const rows = (itemObj.rows as Array<Record<string, unknown>>).map((rowObj, rowIndex) => {
    const rowFormatting = rowObj.formatting as Record<string, unknown> | undefined;
    const cells = ((rowObj.cells as Array<Record<string, unknown>> | undefined) ?? []).map(
      (cellObj, cellIndex) => {
        const cellFormatting = cellObj.formatting as Record<string, unknown> | undefined;
        const cellContent = (cellObj.content as unknown[] | undefined) ?? [];

        return {
          id: `${id}-r-${rowIndex}-c-${cellIndex}`,
          blocks: convertHeaderFooterItemsToFlowBlocks(
            cellContent,
            contentWidth,
            `${id}-r-${rowIndex}-c-${cellIndex}`
          ),
          colSpan: cellFormatting?.gridSpan as number | undefined,
          width: tableMeasurementToPixels(
            cellFormatting?.width as { value: number; type: string } | undefined,
            contentWidth
          ),
          verticalAlign: cellFormatting?.verticalAlign as 'top' | 'center' | 'bottom' | undefined,
          background:
            (cellFormatting?.shading as { fill?: string } | undefined)?.fill != null
              ? `#${(cellFormatting?.shading as { fill?: string }).fill}`
              : undefined,
          borders: convertHeaderFooterCellBorders(
            (cellFormatting?.borders ?? formatting?.borders) as Record<string, unknown> | undefined
          ),
          padding: convertHeaderFooterCellPadding(cellFormatting, formatting, contentWidth),
        };
      }
    );

    return {
      id: `${id}-r-${rowIndex}`,
      cells,
      height: tableMeasurementToPixels(
        rowFormatting?.height as { value: number; type: string } | undefined,
        contentWidth
      ),
      heightRule: rowFormatting?.heightRule as 'auto' | 'atLeast' | 'exact' | undefined,
      isHeader: rowFormatting?.header as boolean | undefined,
    };
  });

  return {
    kind: 'table',
    id,
    rows,
    columnWidths: Array.isArray(itemObj.columnWidths)
      ? (itemObj.columnWidths as number[]).map(twipsToPixels)
      : undefined,
    width: (formatting?.width as { value?: number } | undefined)?.value,
    widthType: (formatting?.width as { type?: string } | undefined)?.type,
    justification: formatting?.justification as 'left' | 'center' | 'right' | undefined,
    indent: tableMeasurementToPixels(
      formatting?.indent as { value: number; type: string } | undefined,
      contentWidth
    ),
  };
}

export function convertHeaderFooterToContent(
  headerFooter: HeaderFooter | null | undefined,
  contentWidth: number,
  metrics: HeaderFooterMetrics,
  measureBlocks: HeaderFooterMeasureBlocks
): HeaderFooterContent | undefined {
  if (!headerFooter || !headerFooter.content || headerFooter.content.length === 0) {
    return undefined;
  }

  const blocks = convertHeaderFooterItemsToFlowBlocks(
    headerFooter.content as unknown[],
    contentWidth,
    'hf'
  );
  if (blocks.length === 0) return undefined;

  const blocksForMeasure: FlowBlock[] = blocks.map((block) => {
    if (block.kind !== 'paragraph') return block;
    const pb = block as ParagraphBlock;
    const hasFloating = pb.runs.some(
      (r) => r.kind === 'image' && 'position' in r && (r as Record<string, unknown>).position
    );
    if (!hasFloating) return block;
    const inlineRuns = pb.runs.filter(
      (r) => !(r.kind === 'image' && 'position' in r && (r as Record<string, unknown>).position)
    );
    if (inlineRuns.length === 0) inlineRuns.push({ kind: 'text' as const, text: '' });
    return { ...pb, runs: inlineRuns };
  });

  const measures = measureBlocks(blocksForMeasure, contentWidth);
  const totalHeight = measures.reduce((h, m) => {
    if (m.kind === 'paragraph' || m.kind === 'table') return h + m.totalHeight;
    return h;
  }, 0);
  const { visualTop, visualBottom } = calculateHeaderFooterVisualBounds(
    blocks,
    measures,
    totalHeight,
    metrics
  );

  return {
    blocks,
    measures,
    height: totalHeight,
    visualTop,
    visualBottom,
  };
}
