import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import type { RenderedDomContext } from '../../../plugin-api/types';
import type { TemplateTag } from '../prosemirror-plugin';
import {
  getTemplateTagRects,
  shouldProjectUnmappedHeaderFooter,
  TemplateHighlightOverlay,
} from './TemplateHighlightOverlay';

function createContext(container: HTMLElement): RenderedDomContext {
  return {
    pagesContainer: container,
    zoom: 1,
    getCoordinatesForPosition: () => null,
    findElementsForRange: () => [],
    getRectsForRange: () => [{ x: 999, y: 999, width: 10, height: 10 }],
    getContainerOffset: () => ({ x: 0, y: 0 }),
  };
}

function createTag(rawTag: string): TemplateTag {
  return {
    id: 'variable:doc_code:0',
    type: 'variable',
    name: 'doc_code',
    rawTag,
    from: 17,
    to: 27,
  };
}

function createOccurrence(rawTag: string, occurrence: number): TemplateTag {
  return {
    ...createTag(rawTag),
    id: `variable:doc_code:${occurrence}`,
    from: 17 + occurrence * 20,
    to: 27 + occurrence * 20,
  };
}

describe('getTemplateTagRects', () => {
  const originalCreateRange = globalThis.document?.createRange;

  beforeEach(() => {
    GlobalRegistrator.register();

    document.createRange = (() => {
      let textNode: Text;
      let start = 0;
      let end = 0;

      return {
        setStart(node: Text, offset: number) {
          textNode = node;
          start = offset;
        },
        setEnd(_node: Text, offset: number) {
          end = offset;
        },
        getClientRects() {
          const span = textNode.parentElement as HTMLElement;
          const left = Number(span.dataset.testLeft ?? '0');
          const top = Number(span.dataset.testTop ?? '0');
          return [
            {
              left: left + start * 5,
              top,
              width: (end - start) * 5,
              height: 12,
            },
          ];
        },
      } as unknown as Range;
    }) as typeof document.createRange;
  });

  afterEach(() => {
    cleanup();
    if (originalCreateRange) {
      document.createRange = originalCreateRange;
    }
    GlobalRegistrator.unregister();
  });

  test('projects repeated header/footer template tags onto visible rendered text', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    for (const top of [52, 1199]) {
      const span = document.createElement('span');
      span.dataset.pmStart = '9';
      span.dataset.pmEnd = '57';
      span.dataset.testLeft = '490';
      span.dataset.testTop = String(top);
      span.textContent = 'CODIGO {doc_code} REVISAO {revision_number}';
      container.appendChild(span);
    }

    const rects = getTemplateTagRects(createContext(container), createTag('{doc_code}'));

    expect(rects).toEqual([
      { x: 525, y: 52, width: 50, height: 12 },
      { x: 525, y: 1199, width: 50, height: 12 },
    ]);
  });

  test('falls back to range lookup when the raw tag is not present in visible text', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    const span = document.createElement('span');
    span.dataset.pmStart = '9';
    span.dataset.pmEnd = '57';
    span.textContent = 'CODIGO already replaced';
    container.appendChild(span);

    expect(getTemplateTagRects(createContext(container), createTag('{doc_code}'))).toEqual([
      { x: 999, y: 999, width: 10, height: 10 },
    ]);
  });

  test('can project onto unmapped rendered header/footer runs once requested', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    const header = document.createElement('div');
    header.className = 'layout-page-header';
    const run = document.createElement('span');
    run.className = 'layout-run layout-run-text';
    run.dataset.testLeft = '400';
    run.dataset.testTop = '48';
    run.textContent = 'CODIGO {doc_code} REVISAO';
    header.appendChild(run);
    container.appendChild(header);

    expect(
      getTemplateTagRects(createContext(container), createTag('{doc_code}'), {
        includeUnmappedHeaderFooter: true,
      })
    ).toEqual([{ x: 435, y: 48, width: 50, height: 12 }]);
  });

  test('allows active duplicate tags to project onto unmapped header/footer runs', () => {
    const projectedRawTags = new Set<string>();
    const firstTag = createOccurrence('{doc_code}', 0);
    const secondTag = createOccurrence('{doc_code}', 1);

    expect(shouldProjectUnmappedHeaderFooter(firstTag, projectedRawTags, new Set())).toBe(true);
    expect(shouldProjectUnmappedHeaderFooter(secondTag, projectedRawTags, new Set())).toBe(false);
    expect(
      shouldProjectUnmappedHeaderFooter(secondTag, projectedRawTags, new Set([secondTag.id]))
    ).toBe(true);
  });

  test('recomputes unmapped header/footer projections when active duplicate changes', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;

    const header = document.createElement('div');
    header.className = 'layout-page-header';
    const run = document.createElement('span');
    run.className = 'layout-run layout-run-text';
    run.dataset.testLeft = '400';
    run.dataset.testTop = '48';
    run.textContent = 'CODIGO {doc_code} REVISAO';
    header.appendChild(run);
    container.appendChild(header);

    const firstTag = createOccurrence('{doc_code}', 0);
    const secondTag = createOccurrence('{doc_code}', 1);
    const context: RenderedDomContext = {
      ...createContext(container),
      getRectsForRange: () => [],
    };

    const { container: overlayContainer, rerender } = render(
      createElement(TemplateHighlightOverlay, { context, tags: [firstTag, secondTag] })
    );

    expect(
      overlayContainer.querySelectorAll(`[data-tag-id="${firstTag.id}"]`).length
    ).toBeGreaterThan(0);
    expect(overlayContainer.querySelectorAll(`[data-tag-id="${secondTag.id}"]`)).toHaveLength(0);

    rerender(
      createElement(TemplateHighlightOverlay, {
        context,
        tags: [firstTag, secondTag],
        hoveredId: secondTag.id,
      })
    );

    expect(
      overlayContainer.querySelectorAll(`[data-tag-id="${secondTag.id}"]`).length
    ).toBeGreaterThan(0);
  });
});
