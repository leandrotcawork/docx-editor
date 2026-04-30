import { describe, expect, test } from 'bun:test';

import { detectVariablesDetailed } from '../variableDetector';
import type { Document } from '../../types/document';

function paragraphWithText(text: string) {
  return {
    type: 'paragraph' as const,
    content: [
      {
        type: 'run' as const,
        content: [{ type: 'text' as const, text }],
      },
    ],
  };
}

describe('variableDetector', () => {
  test('detects variables inside referenced package header and footer content', () => {
    const doc: Document = {
      package: {
        document: {
          content: [],
          sections: [
            {
              properties: {
                headerReferences: [{ type: 'default', rId: 'rIdHeader' }],
                footerReferences: [{ type: 'default', rId: 'rIdFooter' }],
              },
              content: [],
            },
          ],
        },
        headers: new Map([
          [
            'rIdHeader',
            {
              type: 'header',
              hdrFtrType: 'default',
              content: [
                {
                  type: 'table',
                  rows: [
                    {
                      type: 'tableRow',
                      cells: [
                        {
                          type: 'tableCell',
                          content: [paragraphWithText('Header {header_code}')],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          [
            'rIdUnusedHeader',
            {
              type: 'header',
              hdrFtrType: 'default',
              content: [paragraphWithText('Unused {unused_header_code}')],
            },
          ],
        ]),
        footers: new Map([
          [
            'rIdFooter',
            {
              type: 'footer',
              hdrFtrType: 'default',
              content: [paragraphWithText('Footer {footer_code}')],
            },
          ],
          [
            'rIdUnusedFooter',
            {
              type: 'footer',
              hdrFtrType: 'default',
              content: [paragraphWithText('Unused {unused_footer_code}')],
            },
          ],
        ]),
      },
    };

    const result = detectVariablesDetailed(doc);

    expect(result.variables).toEqual(['footer_code', 'header_code']);
    expect(result.byLocation.headers).toEqual(['header_code']);
    expect(result.byLocation.footers).toEqual(['footer_code']);
    expect(result.variables).not.toContain('unused_header_code');
    expect(result.variables).not.toContain('unused_footer_code');
    expect(result.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'header_code', location: 'header' }),
        expect.objectContaining({ name: 'footer_code', location: 'footer' }),
      ])
    );
  });

  test('detects variables from final section header references', () => {
    const doc: Document = {
      package: {
        document: {
          content: [],
          finalSectionProperties: {
            headerReferences: [{ type: 'default', rId: 'rIdFinalHeader' }],
          },
        },
        headers: new Map([
          [
            'rIdFinalHeader',
            {
              type: 'header',
              hdrFtrType: 'default',
              content: [paragraphWithText('Final {final_header_code}')],
            },
          ],
        ]),
      },
    };

    const result = detectVariablesDetailed(doc);

    expect(result.variables).toEqual(['final_header_code']);
    expect(result.byLocation.headers).toEqual(['final_header_code']);
  });

  test('scans a reused header reference only once', () => {
    const doc: Document = {
      package: {
        document: {
          content: [],
          sections: [
            {
              properties: {
                headerReferences: [{ type: 'default', rId: 'rIdSharedHeader' }],
              },
              content: [],
            },
            {
              properties: {
                headerReferences: [{ type: 'default', rId: 'rIdSharedHeader' }],
              },
              content: [],
            },
          ],
          finalSectionProperties: {
            headerReferences: [{ type: 'default', rId: 'rIdSharedHeader' }],
          },
        },
        headers: new Map([
          [
            'rIdSharedHeader',
            {
              type: 'header',
              hdrFtrType: 'default',
              content: [paragraphWithText('Shared {shared_header_code}')],
            },
          ],
        ]),
      },
    };

    const result = detectVariablesDetailed(doc);

    expect(result.variables).toEqual(['shared_header_code']);
    expect(result.totalOccurrences).toBe(1);
    expect(result.occurrences).toEqual([
      expect.objectContaining({ name: 'shared_header_code', location: 'header' }),
    ]);
  });
});
