/**
 * Template Highlight Overlay Component
 *
 * Renders highlight rectangles for template tags on the visible pages.
 * Uses RenderedDomContext to get accurate positioning.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { RenderedDomContext } from '../../../plugin-api/types';
import type { TemplateTag, TagType } from '../prosemirror-plugin';

interface TemplateHighlightOverlayProps {
  context: RenderedDomContext;
  tags: TemplateTag[];
  hoveredId?: string;
  selectedId?: string;
  onHover?: (id: string | undefined) => void;
  onSelect?: (id: string) => void;
}

/** Colors for tag types (matching AnnotationPanel) */
const HIGHLIGHT_COLORS: Record<TagType, string> = {
  variable: 'rgba(245, 158, 11, 0.3)',
  sectionStart: 'rgba(59, 130, 246, 0.3)',
  sectionEnd: 'rgba(59, 130, 246, 0.3)',
  invertedStart: 'rgba(139, 92, 246, 0.3)',
  raw: 'rgba(239, 68, 68, 0.3)',
};

const HOVER_COLORS: Record<TagType, string> = {
  variable: 'rgba(245, 158, 11, 0.5)',
  sectionStart: 'rgba(59, 130, 246, 0.5)',
  sectionEnd: 'rgba(59, 130, 246, 0.5)',
  invertedStart: 'rgba(139, 92, 246, 0.5)',
  raw: 'rgba(239, 68, 68, 0.5)',
};

interface HighlightRect {
  tagId: string;
  tagType: TagType;
  x: number;
  y: number;
  width: number;
  height: number;
}

type RenderRect = Pick<HighlightRect, 'x' | 'y' | 'width' | 'height'>;

function findRawTagOffsets(text: string, rawTag: string): number[] {
  const offsets: number[] = [];
  let index = text.indexOf(rawTag);
  while (index !== -1) {
    offsets.push(index);
    index = text.indexOf(rawTag, index + 1);
  }
  return offsets;
}

function nearestOffset(offsets: number[], expectedOffset: number): number {
  return offsets.reduce((best, offset) =>
    Math.abs(offset - expectedOffset) < Math.abs(best - expectedOffset) ? offset : best
  );
}

function rectKey(rect: RenderRect): string {
  return [
    Math.round(rect.x * 100),
    Math.round(rect.y * 100),
    Math.round(rect.width * 100),
    Math.round(rect.height * 100),
  ].join(':');
}

function collectRawTagRectsFromSpan(
  spanEl: HTMLElement,
  rawTag: string,
  context: RenderedDomContext,
  containerRect: DOMRect,
  preferredOffset?: number
): RenderRect[] {
  if (spanEl.firstChild?.nodeType !== Node.TEXT_NODE) return [];

  const textNode = spanEl.firstChild as Text;
  const text = textNode.textContent ?? '';
  const offsets = findRawTagOffsets(text, rawTag);
  if (offsets.length === 0) return [];

  const ownerDoc = spanEl.ownerDocument;
  if (!ownerDoc) return [];

  const selectedOffsets =
    preferredOffset === undefined ? offsets : [nearestOffset(offsets, preferredOffset)];
  const rects: RenderRect[] = [];

  for (const startChar of selectedOffsets) {
    const endChar = startChar + rawTag.length;
    if (endChar > textNode.length) continue;

    const range = ownerDoc.createRange();
    range.setStart(textNode, startChar);
    range.setEnd(textNode, endChar);

    for (const clientRect of Array.from(range.getClientRects())) {
      rects.push({
        x: (clientRect.left - containerRect.left) / context.zoom,
        y: (clientRect.top - containerRect.top) / context.zoom,
        width: clientRect.width / context.zoom,
        height: clientRect.height / context.zoom,
      });
    }
  }

  return rects;
}

/**
 * Header/footer content is rendered into visible page layers that can repeat
 * the same ProseMirror range on every page. For template tags, project the
 * overlay onto the exact visible raw tag text instead of relying only on the
 * hidden editor decoration coordinates.
 */
export function getTemplateTagRects(
  context: RenderedDomContext,
  tag: TemplateTag,
  options: { includeUnmappedHeaderFooter?: boolean } = {}
): RenderRect[] {
  const fallbackRects = () => context.getRectsForRange(tag.from, tag.to);

  if (!tag.rawTag) {
    return fallbackRects();
  }

  const containerRect = context.pagesContainer.getBoundingClientRect();
  const rects: RenderRect[] = [];
  const seen = new Set<string>();
  const pushRects = (newRects: RenderRect[]) => {
    for (const rect of newRects) {
      const key = rectKey(rect);
      if (!seen.has(key)) {
        seen.add(key);
        rects.push(rect);
      }
    }
  };

  const spans = context.pagesContainer.querySelectorAll('span[data-pm-start][data-pm-end]');
  for (const span of Array.from(spans)) {
    const spanEl = span as HTMLElement;
    const pmStart = Number(spanEl.dataset.pmStart);
    const pmEnd = Number(spanEl.dataset.pmEnd);

    if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) continue;
    if (!(pmEnd > tag.from && pmStart < tag.to)) continue;
    pushRects(collectRawTagRectsFromSpan(spanEl, tag.rawTag, context, containerRect, tag.from - pmStart));
  }

  if (options.includeUnmappedHeaderFooter) {
    const unmappedHeaderFooterRuns = context.pagesContainer.querySelectorAll(
      [
        '.layout-page-header .layout-run-text:not([data-pm-start])',
        '.layout-page-footer .layout-run-text:not([data-pm-start])',
      ].join(', ')
    );

    for (const run of Array.from(unmappedHeaderFooterRuns)) {
      pushRects(collectRawTagRectsFromSpan(run as HTMLElement, tag.rawTag, context, containerRect));
    }
  }

  return rects.length > 0 ? rects : fallbackRects();
}

export function shouldProjectUnmappedHeaderFooter(
  tag: TemplateTag,
  projectedRawTags: Set<string>,
  activeTagIds: Set<string>
): boolean {
  if (!tag.rawTag) return false;
  if (activeTagIds.has(tag.id)) return true;
  if (projectedRawTags.has(tag.rawTag)) return false;

  projectedRawTags.add(tag.rawTag);
  return true;
}

export function TemplateHighlightOverlay({
  context,
  tags,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: TemplateHighlightOverlayProps) {
  // Version counter bumped by resize/layout changes to trigger recompute
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Compute highlight rectangles synchronously during render (no blank frames)
  const computeHighlights = useCallback((): HighlightRect[] => {
    const containerOffset = context.getContainerOffset();
    const rects: HighlightRect[] = [];
    const projectedRawTags = new Set<string>();
    const activeTagIds = new Set([hoveredId, selectedId].filter(Boolean) as string[]);

    for (const tag of tags) {
      const includeUnmappedHeaderFooter = shouldProjectUnmappedHeaderFooter(
        tag,
        projectedRawTags,
        activeTagIds
      );

      const tagRects = getTemplateTagRects(context, tag, { includeUnmappedHeaderFooter });
      for (const rect of tagRects) {
        rects.push({
          tagId: tag.id,
          tagType: tag.type,
          x: rect.x + containerOffset.x,
          y: rect.y + containerOffset.y,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    return rects;
  }, [context, hoveredId, selectedId, tags]);

  // Compute synchronously — no useEffect gap that causes blinking

  const highlights = useMemo(() => computeHighlights(), [computeHighlights, layoutVersion]);

  // Recompute on window resize
  useEffect(() => {
    const handleResize = () => {
      requestAnimationFrame(() => setLayoutVersion((v) => v + 1));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Also observe the pagesContainer for size changes (zoom, layout changes)
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => setLayoutVersion((v) => v + 1));
    });
    observer.observe(context.pagesContainer);
    return () => observer.disconnect();
  }, [context.pagesContainer]);

  // Show all highlights, with enhanced styling for hovered/selected
  if (highlights.length === 0) {
    return null;
  }

  return (
    <div className="template-highlight-overlay">
      {highlights.map((rect, index) => {
        const isHovered = rect.tagId === hoveredId;
        const isSelected = rect.tagId === selectedId;
        const color =
          isHovered || isSelected ? HOVER_COLORS[rect.tagType] : HIGHLIGHT_COLORS[rect.tagType];

        return (
          <div
            key={`${rect.tagId}-${index}`}
            className={`template-highlight ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
            data-tag-id={rect.tagId}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: color,
              borderRadius: 2,
              cursor: 'pointer',
            }}
            onMouseEnter={() => onHover?.(rect.tagId)}
            onMouseLeave={() => onHover?.(undefined)}
            onClick={() => onSelect?.(rect.tagId)}
          />
        );
      })}
    </div>
  );
}

export const TEMPLATE_HIGHLIGHT_OVERLAY_STYLES = `
.template-highlight-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  overflow: visible;
}

.template-highlight {
  pointer-events: auto;
  transition: background-color 0.1s ease;
}

.template-highlight:hover,
.template-highlight.hovered {
  filter: brightness(0.9);
}

.template-highlight.selected {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.6);
}
`;
