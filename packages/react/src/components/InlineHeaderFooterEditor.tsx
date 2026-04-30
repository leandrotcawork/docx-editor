/**
 * InlineHeaderFooterEditor — inline overlay editor for header/footer content
 *
 * Renders a ProseMirror EditorView positioned over the header/footer area
 * on the page, Google Docs style. The main body is dimmed and the toolbar
 * routes formatting commands to this editor while it's active.
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
  useImperativeHandle,
  useLayoutEffect,
  forwardRef,
} from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from '../i18n';

import { schema } from '@eigenpal/docx-core/prosemirror/schema';
import { headerFooterToProseDoc } from '@eigenpal/docx-core/prosemirror/conversion/toProseDoc';
import { proseDocToBlocks } from '@eigenpal/docx-core/prosemirror/conversion/fromProseDoc';
import {
  CellSelection,
  EditorState,
  EditorView,
  extractSelectionState,
  redo,
  TextSelection,
  undo,
  type SelectionState,
} from '@eigenpal/docx-core/prosemirror';
import { createStarterKit } from '@eigenpal/docx-core/prosemirror/extensions/StarterKit';
import { ExtensionManager } from '@eigenpal/docx-core/prosemirror/extensions/ExtensionManager';
import { createStyleResolver } from '@eigenpal/docx-core/prosemirror';
import type {
  HeaderFooter,
  Paragraph,
  Table,
  StyleDefinitions,
} from '@eigenpal/docx-core/types/document';

import 'prosemirror-view/style/prosemirror.css';

// ============================================================================
// TYPES
// ============================================================================

export interface InlineHeaderFooterEditorProps {
  /** The header or footer being edited */
  headerFooter: HeaderFooter;
  /** Whether editing header or footer */
  position: 'header' | 'footer';
  /** Document styles for style resolution */
  styles?: StyleDefinitions | null;
  /** The DOM element to overlay (the .layout-page-header / .layout-page-footer) */
  targetElement: HTMLElement;
  /** The positioning parent element (the div wrapping PagedEditor) */
  parentElement: HTMLElement;
  /** Callback when editing is complete — receives updated content blocks */
  onSave: (content: Array<Paragraph | Table>) => void;
  /** Callback when editing is cancelled */
  onClose: () => void;
  /** Callback when selection changes in the HF editor (for toolbar sync) */
  onSelectionChange?: (state: SelectionState | null) => void;
  /** Callback for context menu events inside the inline editor */
  onContextMenu?: (data: { x: number; y: number; hasSelection: boolean }) => void;
  /** Callback to remove the header/footer entirely */
  onRemove?: () => void;
}

export interface InlineHeaderFooterEditorRef {
  /** Get the ProseMirror EditorView */
  getView(): EditorView | null;
  /** Focus the editor */
  focus(): void;
  /** Undo */
  undo(): boolean;
  /** Redo */
  redo(): boolean;
}

type TableCellPositionView = Pick<EditorView, 'posAtDOM' | 'state'>;

export function getTableCellSelectionPositions(
  view: TableCellPositionView,
  cellElement: HTMLElement
): number[] {
  const candidates: number[] = [];
  const addCandidate = (pos: number | null | undefined) => {
    if (typeof pos === 'number' && Number.isFinite(pos) && !candidates.includes(pos)) {
      candidates.push(pos);
    }
  };

  const domPos = view.posAtDOM(cellElement, 0);
  addCandidate(domPos);

  try {
    const $pos = view.state.doc.resolve(domPos);
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        addCandidate($pos.before(depth));
        break;
      }
    }
  } catch {
    // The direct DOM position remains the best ProseMirror-native fallback.
  }

  return candidates;
}

export function createTableCellSelectionFromElement(
  view: TableCellPositionView,
  cellElement: HTMLElement
): CellSelection | null {
  const cellPositions = getTableCellSelectionPositions(view, cellElement);
  for (const cellPos of cellPositions) {
    try {
      return CellSelection.create(view.state.doc, cellPos);
    } catch {
      // Try the next candidate; different DOM adapters map td offsets differently.
    }
  }
  return null;
}

// ============================================================================
// STYLES
// ============================================================================

const separatorBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 0',
  fontSize: 11,
  color: '#4285f4',
  userSelect: 'none',
};

const labelStyle: CSSProperties = {
  fontWeight: 500,
  letterSpacing: 0.3,
};

const optionsButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#4285f4',
  cursor: 'pointer',
  fontSize: 11,
  padding: '2px 6px',
  borderRadius: 3,
};

const dropdownStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: '100%',
  background: 'white',
  border: '1px solid #dadce0',
  borderRadius: 4,
  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  zIndex: 100,
  minWidth: 160,
  padding: '4px 0',
};

const dropdownItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 12px',
  border: 'none',
  background: 'none',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 12,
  color: '#3c4043',
};

// ============================================================================
// COMPONENT
// ============================================================================

export const InlineHeaderFooterEditor = forwardRef<
  InlineHeaderFooterEditorRef,
  InlineHeaderFooterEditorProps
>(function InlineHeaderFooterEditor(
  {
    headerFooter,
    position,
    styles,
    targetElement,
    parentElement,
    onSave,
    onClose,
    onSelectionChange,
    onContextMenu,
    onRemove,
  },
  ref
) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Resolve default font size from document styles so the PM editor's
  // line-height calculations use the correct base (not browser-default 16px)
  const defaultFontSizePt = useMemo(() => {
    if (!styles) return 11; // Word 2007+ default
    const resolver = createStyleResolver(styles);
    const resolved = resolver.resolveParagraphStyle(undefined);
    // fontSize in document model is in half-points
    return resolved.runFormatting?.fontSize ? (resolved.runFormatting.fontSize as number) / 2 : 11;
  }, [styles]);
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  const selectTableCellFromElement = useCallback((cellElement: HTMLElement): boolean => {
    const view = viewRef.current;
    if (!view) return false;

    const selection = createTableCellSelectionFromElement(view, cellElement);
    if (!selection) return false;

    view.dispatch(view.state.tr.setSelection(selection));
    view.focus();
    return true;
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const view = viewRef.current;
      if (!onContextMenu || !view) return;
      e.preventDefault();
      e.stopPropagation();

      const { from, to } = view.state.selection;
      const posAtClick = view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (posAtClick && (from === to || posAtClick.pos < from || posAtClick.pos > to)) {
        try {
          const $pos = view.state.doc.resolve(posAtClick.pos);
          view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
          view.focus();
        } catch {
          // If the click maps to a non-text position, keep the current selection.
        }
      }

      const updatedSelection = view.state.selection;
      onContextMenu({
        x: e.clientX,
        y: e.clientY,
        hasSelection: updatedSelection.from !== updatedSelection.to,
      });
    },
    [onContextMenu]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      const cell = target?.closest('td,th');
      if (!cell || !editorContainerRef.current?.contains(cell)) return;
      if (selectTableCellFromElement(cell as HTMLElement)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [selectTableCellFromElement]
  );

  // Compute overlay position relative to the parent element
  const [overlayPos, setOverlayPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    const computePosition = () => {
      const parentRect = parentElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      setOverlayPos({
        top: targetRect.top - parentRect.top + parentElement.scrollTop,
        left: targetRect.left - parentRect.left + parentElement.scrollLeft,
        width: targetRect.width,
      });
    };
    computePosition();

    // Recompute on scroll/resize
    const scrollParent = parentElement.closest('[style*="overflow"]') || parentElement;
    scrollParent.addEventListener('scroll', computePosition);
    window.addEventListener('resize', computePosition);
    return () => {
      scrollParent.removeEventListener('scroll', computePosition);
      window.removeEventListener('resize', computePosition);
    };
  }, [targetElement, parentElement]);

  // Create ProseMirror editor when the container is available
  // (overlayPos starts null → first render returns null → container ref not set)
  useEffect(() => {
    if (!editorContainerRef.current || viewRef.current) return;

    // Convert header/footer content to PM document
    const pmDoc = headerFooterToProseDoc(headerFooter.content, {
      styles: styles || undefined,
    });

    // Create a fresh ExtensionManager to get independent plugin instances
    // (keyed plugins like history$ can't be shared across EditorViews)
    const hfMgr = new ExtensionManager(createStarterKit());
    hfMgr.buildSchema();
    hfMgr.initializeRuntime();
    const plugins = hfMgr.getPlugins();

    const state = EditorState.create({
      doc: pmDoc,
      schema,
      plugins,
    });

    const view = new EditorView(editorContainerRef.current, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        if (tr.docChanged) {
          setIsDirty(true);
        }
        // Report selection changes for toolbar sync
        if (tr.selectionSet || tr.docChanged) {
          const selState = extractSelectionState(newState);
          onSelectionChange?.(selState);
        }
      },
    });

    viewRef.current = view;

    // Auto-focus
    requestAnimationFrame(() => {
      view.focus();
      // Report initial selection state
      const selState = extractSelectionState(view.state);
      onSelectionChange?.(selState);
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayPos]); // Re-run when position is computed (container becomes available)

  // Save current content
  const handleSave = useCallback(() => {
    if (!viewRef.current) return;
    const blocks = proseDocToBlocks(viewRef.current.state.doc);
    onSave(blocks);
  }, [onSave]);

  // Save + close
  const handleSaveAndClose = useCallback(() => {
    if (isDirty) {
      handleSave();
    } else {
      onClose();
    }
  }, [isDirty, handleSave, onClose]);

  // Handle Escape key — save + close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleSaveAndClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleSaveAndClose]);

  // Close options dropdown when clicking outside
  useEffect(() => {
    if (!showOptions) return;
    function handleClick(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showOptions]);

  // Expose ref
  useImperativeHandle(ref, () => ({
    getView: () => viewRef.current,
    focus: () => viewRef.current?.focus(),
    undo: () => {
      const view = viewRef.current;
      if (!view) return false;
      return undo(view.state, view.dispatch);
    },
    redo: () => {
      const view = viewRef.current;
      if (!view) return false;
      return redo(view.state, view.dispatch);
    },
  }));

  const { t } = useTranslation();
  const label = position === 'header' ? t('headerFooter.header') : t('headerFooter.footer');

  if (!overlayPos) return null;

  const containerStyle: CSSProperties = {
    position: 'absolute',
    top: overlayPos.top,
    left: overlayPos.left,
    width: overlayPos.width,
    zIndex: 10,
  };

  return (
    <div
      className="hf-inline-editor"
      style={containerStyle}
      onMouseDown={(e) => {
        // Prevent clicks from bubbling to pages container / body click handler
        e.stopPropagation();
      }}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      {/* Separator bar — shown below for header, above for footer */}
      {position === 'footer' && (
        <div className="hf-separator-bar" style={separatorBarStyle}>
          <span style={labelStyle}>{label}</span>
          <OptionsMenu
            label={label}
            showOptions={showOptions}
            setShowOptions={setShowOptions}
            optionsRef={optionsRef}
            onRemove={onRemove}
            onClose={handleSaveAndClose}
            viewRef={viewRef}
          />
        </div>
      )}

      {/* ProseMirror editor area */}
      <div
        ref={editorContainerRef}
        className="hf-editor-pm"
        style={{
          minHeight: 40,
          outline: 'none',
          fontSize: `${defaultFontSizePt}pt`,
        }}
      />

      {/* Separator bar — shown below for header */}
      {position === 'header' && (
        <div className="hf-separator-bar" style={separatorBarStyle}>
          <span style={labelStyle}>{label}</span>
          <OptionsMenu
            label={label}
            showOptions={showOptions}
            setShowOptions={setShowOptions}
            optionsRef={optionsRef}
            onRemove={onRemove}
            onClose={handleSaveAndClose}
            viewRef={viewRef}
          />
        </div>
      )}
    </div>
  );
});

// ============================================================================
// OPTIONS MENU SUB-COMPONENT
// ============================================================================

function OptionsMenu({
  label,
  showOptions,
  setShowOptions,
  optionsRef,
  onRemove,
  onClose,
  viewRef,
}: {
  label: string;
  showOptions: boolean;
  setShowOptions: (v: boolean | ((prev: boolean) => boolean)) => void;
  optionsRef: React.RefObject<HTMLDivElement | null>;
  onRemove?: () => void;
  onClose: () => void;
  viewRef: React.RefObject<EditorView | null>;
}) {
  const { t } = useTranslation();
  const insertField = (fieldType: 'PAGE' | 'NUMPAGES') => {
    const view = viewRef.current;
    if (!view) return;
    // Get marks at the current cursor position so the field inherits surrounding styling
    const { $from, from } = view.state.selection;
    const marks = view.state.storedMarks || $from.marks();
    const node = schema.nodes.field.create({
      fieldType,
      instruction: ` ${fieldType} \\* MERGEFORMAT `,
      fieldKind: 'simple',
      dirty: true,
    });
    const tr = view.state.tr.insert(from, node.mark(marks));
    view.dispatch(tr);
    view.focus();
  };

  return (
    <div style={{ position: 'relative' }} ref={optionsRef}>
      <button
        type="button"
        style={optionsButtonStyle}
        onClick={(e) => {
          e.stopPropagation();
          setShowOptions((prev) => !prev);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {t('headerFooter.options')} ▾
      </button>
      {showOptions && (
        <div style={dropdownStyle}>
          <button
            type="button"
            style={dropdownItemStyle}
            onClick={() => {
              setShowOptions(false);
              insertField('PAGE');
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#f1f3f4';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            {t('headerFooter.insertPageNumber')}
          </button>
          <button
            type="button"
            style={dropdownItemStyle}
            onClick={() => {
              setShowOptions(false);
              insertField('NUMPAGES');
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#f1f3f4';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            {t('headerFooter.insertTotalPages')}
          </button>
          <div style={{ borderTop: '1px solid #e8eaed', margin: '4px 0' }} />
          {onRemove && (
            <button
              type="button"
              style={dropdownItemStyle}
              onClick={() => {
                setShowOptions(false);
                onRemove();
              }}
              onMouseOver={(e) => {
                (e.target as HTMLElement).style.backgroundColor = '#f1f3f4';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              {t('headerFooter.remove', { label: label.toLowerCase() })}
            </button>
          )}
          <button
            type="button"
            style={dropdownItemStyle}
            onClick={() => {
              setShowOptions(false);
              onClose();
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.backgroundColor = '#f1f3f4';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            {t('headerFooter.closeEditing', { label: label.toLowerCase() })}
          </button>
        </div>
      )}
    </div>
  );
}
