/**
 * Regression guard: field nodes are inline atoms, but visually they behave like
 * text runs after PAGE/NUMPAGES substitution. Formatting marks must therefore
 * survive the PM -> layout conversion just like they do for text and tab runs.
 */

import { describe, expect, test } from 'bun:test';
import { toProseDoc } from '../../prosemirror/conversion/toProseDoc';
import type { Document, Paragraph } from '../../types/document';
import type { FieldRun } from '../../layout-engine/types';
import { toFlowBlocks } from '../toFlowBlocks';

function pageFieldParagraph(): Paragraph {
  return {
    type: 'paragraph',
    content: [
      {
        type: 'simpleField',
        instruction: 'PAGE \\* MERGEFORMAT',
        fieldType: 'PAGE',
        content: [
          {
            type: 'run',
            formatting: {
              bold: true,
              color: { rgb: '5A5A5A' },
              fontSize: 14,
              fontFamily: { ascii: 'Aptos', hAnsi: 'Aptos' },
            },
            content: [{ type: 'text', text: '1' }],
          },
        ],
      },
    ],
  };
}

function doc(paragraph: Paragraph): Document {
  return { package: { document: { content: [paragraph] } } };
}

function firstField(paragraph: Paragraph): FieldRun | undefined {
  const pm = toProseDoc(doc(paragraph));
  const blocks = toFlowBlocks(pm);
  const block = blocks.find((item) => item.kind === 'paragraph');
  return block?.kind === 'paragraph' ? (block.runs[0] as FieldRun) : undefined;
}

describe('toFlowBlocks - field formatting', () => {
  test('PAGE fields preserve their marks as layout run formatting', () => {
    const field = firstField(pageFieldParagraph());
    expect(field).toMatchObject({
      kind: 'field',
      fieldType: 'PAGE',
      fallback: '1',
      bold: true,
      color: '#5A5A5A',
      fontSize: 7,
      fontFamily: 'Aptos',
    });
  });

  test('complex NUMPAGES fields use the same mark formatting path', () => {
    const field = firstField({
      type: 'paragraph',
      content: [
        {
          type: 'complexField',
          instruction: 'NUMPAGES \\* MERGEFORMAT',
          fieldType: 'NUMPAGES',
          fieldCode: [],
          fieldResult: [
            {
              type: 'run',
              formatting: {
                italic: true,
                color: { rgb: '7F7F7F' },
                fontSize: 16,
              },
              content: [{ type: 'text', text: '4' }],
            },
          ],
        },
      ],
    });

    expect(field).toMatchObject({
      kind: 'field',
      fieldType: 'NUMPAGES',
      fallback: '4',
      italic: true,
      color: '#7F7F7F',
      fontSize: 8,
    });
  });
});
