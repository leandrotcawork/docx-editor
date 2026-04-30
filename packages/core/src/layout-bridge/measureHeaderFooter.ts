/**
 * Header/Footer Measurement
 *
 * Measures header/footer content to determine the space they require.
 * The measured heights are used to adjust effective margins so body
 * content doesn't overlap with headers/footers.
 */

import type { Paragraph, Table, HeaderFooter, HeaderFooterType, Run } from '../types/document';
import type {
  FlowBlock,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  TableBlock,
  TableMeasure,
} from '../layout-engine/types';
import { measureParagraph, twipsToPx } from './measuring';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Measured header/footer content for a single variant (default, first, even).
 */
export interface HeaderFooterMeasurement {
  /** The variant type. */
  type: HeaderFooterType;
  /** Converted flow blocks. */
  blocks: FlowBlock[];
  /** Block measurements. */
  measures: Measure[];
  /** Total height of all content. */
  totalHeight: number;
}

/**
 * All measured header/footer content for a section.
 */
export interface SectionHeaderFooterMeasurements {
  /** Header measurements by type. */
  headers: Partial<Record<HeaderFooterType, HeaderFooterMeasurement>>;
  /** Footer measurements by type. */
  footers: Partial<Record<HeaderFooterType, HeaderFooterMeasurement>>;
}

/**
 * Options for header/footer measurement.
 */
export interface MeasureHeaderFooterOptions {
  /** Maximum width for content (content area width). */
  maxWidth: number;
  /** Current page number (for token resolution). */
  pageNumber?: number;
  /** Total page count (for token resolution). */
  totalPages?: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert header/footer content to flow blocks.
 *
 * Creates a temporary ProseMirror-like structure from the content
 * and converts it to flow blocks.
 */
function contentToFlowBlocks(content: (Paragraph | Table)[], availableWidth: number): FlowBlock[] {
  const blocks: FlowBlock[] = [];

  content.forEach((item, index) => {
    if (item.type === 'paragraph') {
      blocks.push(paragraphToFlowBlock(item));
    } else if (item.type === 'table') {
      blocks.push(tableToFlowBlock(item, `hf-table-${index}`, availableWidth));
    }
  });

  return blocks;
}

/**
 * Map Document alignment to layout alignment.
 * 'both' in Word = 'justify' in layout.
 */
function mapAlignment(
  alignment: string | undefined
): 'left' | 'center' | 'right' | 'justify' | undefined {
  if (!alignment) return undefined;
  if (alignment === 'both') return 'justify';
  if (
    alignment === 'left' ||
    alignment === 'center' ||
    alignment === 'right' ||
    alignment === 'justify'
  ) {
    return alignment;
  }
  return undefined;
}

/**
 * Convert a Run's content to flow block runs.
 */
function processRun(run: Run, output: ParagraphBlock['runs']): void {
  for (const content of run.content) {
    if (content.type === 'text') {
      output.push({
        kind: 'text',
        text: content.text,
        fontFamily:
          run.formatting?.fontFamily?.ascii ?? run.formatting?.fontFamily?.hAnsi ?? 'Arial',
        fontSize: run.formatting?.fontSize ? run.formatting.fontSize / 2 : 12,
        bold: run.formatting?.bold,
        italic: run.formatting?.italic,
        underline: run.formatting?.underline ? true : undefined,
      });
    } else if (content.type === 'tab') {
      output.push({ kind: 'tab' });
    } else if (content.type === 'break' && content.breakType === 'textWrapping') {
      output.push({ kind: 'lineBreak' });
    }
    // Handle page number fields - they'll be resolved later
    // For now, just add placeholder text
  }
}

/**
 * Convert paragraph formatting spacing (twips) to layout-engine ParagraphSpacing (pixels).
 */
function buildSpacing(fmt: {
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacing?: number;
  lineSpacingRule?: string;
}) {
  const s: {
    before?: number;
    after?: number;
    line?: number;
    lineUnit?: 'px' | 'multiplier';
    lineRule?: 'auto' | 'exact' | 'atLeast';
  } = {};
  if (fmt.spaceBefore != null) s.before = twipsToPx(fmt.spaceBefore);
  if (fmt.spaceAfter != null) s.after = twipsToPx(fmt.spaceAfter);
  if (fmt.lineSpacing != null) {
    if (fmt.lineSpacingRule === 'exact' || fmt.lineSpacingRule === 'atLeast') {
      s.line = twipsToPx(fmt.lineSpacing);
      s.lineUnit = 'px';
      s.lineRule = fmt.lineSpacingRule;
    } else {
      s.line = fmt.lineSpacing / 240;
      s.lineUnit = 'multiplier';
      s.lineRule = 'auto';
    }
  }
  return Object.keys(s).length > 0 ? s : undefined;
}

/**
 * Convert a Document Paragraph to a FlowBlock.
 */
function paragraphToFlowBlock(para: Paragraph): ParagraphBlock {
  const fmt = para.formatting;

  const block: ParagraphBlock = {
    kind: 'paragraph',
    id: `hf-${para.paraId ?? Math.random().toString(36).slice(2)}`,
    pmStart: 0,
    pmEnd: 0,
    runs: [],
    attrs: {
      alignment: mapAlignment(fmt?.alignment),
      spacing: fmt ? buildSpacing(fmt) : undefined,
      indent: fmt
        ? {
            left: fmt.indentLeft != null ? twipsToPx(fmt.indentLeft) : undefined,
            right: fmt.indentRight != null ? twipsToPx(fmt.indentRight) : undefined,
            firstLine: fmt.hangingIndent
              ? undefined
              : fmt.indentFirstLine != null
                ? twipsToPx(fmt.indentFirstLine)
                : undefined,
            hanging: fmt.hangingIndent
              ? fmt.indentFirstLine != null
                ? Math.abs(twipsToPx(fmt.indentFirstLine))
                : undefined
              : undefined,
          }
        : undefined,
    },
  };

  // Convert paragraph content to runs
  for (const item of para.content) {
    if (item.type === 'run') {
      processRun(item, block.runs);
    } else if (item.type === 'hyperlink') {
      // Convert hyperlink children (runs) to flow block runs
      for (const child of item.children) {
        if (child.type === 'run') {
          // Mark hyperlink runs with underline
          const hyperlinkRun: Run = {
            ...child,
            formatting: {
              ...child.formatting,
              underline: child.formatting?.underline ?? { style: 'single' },
            },
          };
          processRun(hyperlinkRun, block.runs);
        }
      }
    }
  }

  // Ensure at least one run for empty paragraphs
  if (block.runs.length === 0) {
    block.runs.push({
      kind: 'text',
      text: '',
      fontFamily: 'Arial',
      fontSize: 12,
    });
  }

  return block;
}

function measurementToPx(
  measurement: { value: number; type: string } | undefined,
  availableWidth: number
): number | undefined {
  if (!measurement) return undefined;
  if (measurement.type === 'dxa') return twipsToPx(measurement.value);
  if (measurement.type === 'pct') return availableWidth * (measurement.value / 5000);
  return undefined;
}

function cellPadding(
  cell: Table['rows'][number]['cells'][number],
  table: Table,
  availableWidth: number
): { top: number; right: number; bottom: number; left: number } {
  const margins = cell.formatting?.margins ?? table.formatting?.cellMargins;

  return {
    top: measurementToPx(margins?.top, availableWidth) ?? 0,
    right: measurementToPx(margins?.right, availableWidth) ?? 7,
    bottom: measurementToPx(margins?.bottom, availableWidth) ?? 0,
    left: measurementToPx(margins?.left, availableWidth) ?? 7,
  };
}

function tableToFlowBlock(table: Table, id: string, availableWidth: number): TableBlock {
  const rows = table.rows.map((row, rowIndex) => ({
    id: `${id}-row-${rowIndex}`,
    height: row.formatting?.height ? twipsToPx(row.formatting.height.value) : undefined,
    heightRule: row.formatting?.heightRule,
    isHeader: row.formatting?.header,
    cells: row.cells.map((cell, cellIndex) => {
      const width = measurementToPx(cell.formatting?.width, availableWidth);
      const padding = cellPadding(cell, table, availableWidth);
      const nestedContentWidth =
        width !== undefined ? Math.max(0, width - padding.left - padding.right) : availableWidth;

      return {
        id: `${id}-row-${rowIndex}-cell-${cellIndex}`,
        blocks: contentToFlowBlocks(cell.content, nestedContentWidth),
        colSpan: cell.formatting?.gridSpan,
        width,
        verticalAlign: cell.formatting?.verticalAlign,
        padding,
      };
    }),
  }));

  return {
    kind: 'table',
    id,
    rows,
    columnWidths: table.columnWidths?.map(twipsToPx),
    width: table.formatting?.width?.value,
    widthType: table.formatting?.width?.type,
    justification: table.formatting?.justification,
    indent: table.formatting?.indent ? twipsToPx(table.formatting.indent.value) : undefined,
  };
}

/**
 * Measure a single block.
 */
function measureBlock(block: FlowBlock, maxWidth: number): Measure {
  if (block.kind === 'paragraph') {
    return measureParagraph(block as ParagraphBlock, maxWidth);
  }

  if (block.kind === 'table') {
    return measureTable(block as TableBlock, maxWidth);
  }

  return { kind: 'paragraph', lines: [], totalHeight: 0 };
}

function resolveColumnWidths(table: TableBlock, maxWidth: number): number[] {
  if (table.columnWidths && table.columnWidths.length > 0) {
    return table.columnWidths;
  }

  const columnCount = Math.max(...table.rows.map((row) => row.cells.length), 1);
  return Array.from({ length: columnCount }, () => maxWidth / columnCount);
}

function measureTable(table: TableBlock, maxWidth: number): TableMeasure {
  const columnWidths = resolveColumnWidths(table, maxWidth);
  const rows = table.rows.map((row) => {
    let columnIndex = 0;
    const cells = row.cells.map((cell) => {
      const colSpan = cell.colSpan ?? 1;
      const width =
        cell.width ??
        columnWidths
          .slice(columnIndex, columnIndex + colSpan)
          .reduce((sum, columnWidth) => sum + columnWidth, 0);
      const padding = cell.padding ?? { top: 0, right: 7, bottom: 0, left: 7 };
      const contentWidth = Math.max(0, width - padding.left - padding.right);
      const blockMeasures = cell.blocks.map((block) => measureBlock(block, contentWidth));
      const contentHeight = blockMeasures.reduce((sum, measure) => {
        if ('totalHeight' in measure) return sum + (measure.totalHeight ?? 0);
        return sum;
      }, 0);
      const height = contentHeight + padding.top + padding.bottom;

      columnIndex += colSpan;

      return {
        blocks: blockMeasures,
        width,
        height,
        colSpan,
        rowSpan: cell.rowSpan,
      };
    });
    const measuredHeight = Math.max(...cells.map((cell) => cell.height), 0);
    const rowHeight =
      row.heightRule === 'exact'
        ? row.height ?? measuredHeight
        : Math.max(row.height ?? 0, measuredHeight);

    return {
      cells: cells.map((cell) => ({ ...cell, height: rowHeight })),
      height: rowHeight,
    };
  });

  return {
    kind: 'table',
    rows,
    columnWidths,
    totalWidth: columnWidths.reduce((sum, width) => sum + width, 0),
    totalHeight: rows.reduce((sum, row) => sum + row.height, 0),
  };
}

/**
 * Calculate total height from measurements.
 */
function calculateTotalHeight(measures: Measure[]): number {
  return measures.reduce((total, measure) => {
    if (measure.kind === 'paragraph' || measure.kind === 'table') {
      return total + (measure as ParagraphMeasure | TableMeasure).totalHeight;
    }
    return total;
  }, 0);
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Measure a single header or footer.
 *
 * @param headerFooter - The header/footer content to measure.
 * @param options - Measurement options.
 * @returns Measurement result with blocks, measures, and total height.
 */
export function measureHeaderFooter(
  headerFooter: HeaderFooter,
  options: MeasureHeaderFooterOptions
): HeaderFooterMeasurement {
  const { maxWidth } = options;

  // Convert content to flow blocks
  const blocks = contentToFlowBlocks(headerFooter.content, maxWidth);

  // Measure all blocks
  const measures = blocks.map((block) => measureBlock(block, maxWidth));

  // Calculate total height
  const totalHeight = calculateTotalHeight(measures);

  return {
    type: headerFooter.hdrFtrType,
    blocks,
    measures,
    totalHeight,
  };
}

/**
 * Measure all headers and footers for a section.
 *
 * @param headers - Map of header relationship IDs to HeaderFooter content.
 * @param footers - Map of footer relationship IDs to HeaderFooter content.
 * @param headerRefs - Header references in the section (rId + type).
 * @param footerRefs - Footer references in the section (rId + type).
 * @param options - Measurement options.
 * @returns All measurements organized by type.
 */
export function measureSectionHeadersFooters(
  headers: Map<string, HeaderFooter> | undefined,
  footers: Map<string, HeaderFooter> | undefined,
  headerRefs: Array<{ type: HeaderFooterType; rId: string }> | undefined,
  footerRefs: Array<{ type: HeaderFooterType; rId: string }> | undefined,
  options: MeasureHeaderFooterOptions
): SectionHeaderFooterMeasurements {
  const result: SectionHeaderFooterMeasurements = {
    headers: {},
    footers: {},
  };

  // Measure headers
  if (headers && headerRefs) {
    for (const ref of headerRefs) {
      const headerContent = headers.get(ref.rId);
      if (headerContent) {
        result.headers[ref.type] = measureHeaderFooter(headerContent, options);
      }
    }
  }

  // Measure footers
  if (footers && footerRefs) {
    for (const ref of footerRefs) {
      const footerContent = footers.get(ref.rId);
      if (footerContent) {
        result.footers[ref.type] = measureHeaderFooter(footerContent, options);
      }
    }
  }

  return result;
}

/**
 * Get the appropriate header/footer measurement for a specific page.
 *
 * @param measurements - All measurements for the section.
 * @param pageNumber - 1-indexed page number.
 * @param isFirstPage - Whether this is the first page of the section.
 * @param hasDifferentFirst - Whether the section has different first page header/footer.
 * @param hasDifferentEvenOdd - Whether the section has different even/odd headers/footers.
 * @returns The appropriate measurement, or undefined if none.
 */
export function getHeaderFooterForPage(
  measurements: Partial<Record<HeaderFooterType, HeaderFooterMeasurement>>,
  pageNumber: number,
  isFirstPage: boolean,
  hasDifferentFirst: boolean,
  hasDifferentEvenOdd: boolean
): HeaderFooterMeasurement | undefined {
  // First page
  if (isFirstPage && hasDifferentFirst && measurements.first) {
    return measurements.first;
  }

  // Even page (page 2, 4, 6, ...)
  if (hasDifferentEvenOdd && pageNumber % 2 === 0 && measurements.even) {
    return measurements.even;
  }

  // Default
  return measurements.default;
}

/**
 * Get the maximum header height across all variants.
 * Used when we need a single header height for all pages.
 */
export function getMaxHeaderHeight(
  measurements: Partial<Record<HeaderFooterType, HeaderFooterMeasurement>>
): number {
  let maxHeight = 0;

  for (const measurement of Object.values(measurements)) {
    if (measurement && measurement.totalHeight > maxHeight) {
      maxHeight = measurement.totalHeight;
    }
  }

  return maxHeight;
}

/**
 * Get the maximum footer height across all variants.
 * Used when we need a single footer height for all pages.
 */
export function getMaxFooterHeight(
  measurements: Partial<Record<HeaderFooterType, HeaderFooterMeasurement>>
): number {
  let maxHeight = 0;

  for (const measurement of Object.values(measurements)) {
    if (measurement && measurement.totalHeight > maxHeight) {
      maxHeight = measurement.totalHeight;
    }
  }

  return maxHeight;
}
