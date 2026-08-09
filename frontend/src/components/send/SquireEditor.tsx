import DOMPurify from 'dompurify';
import React, { useEffect, useRef } from 'react';
import Squire from "squire-rte";

import { sanitizeHtml } from "../../util/html.ts";

// @ts-ignore
window.DOMPurify = DOMPurify;

export interface SquireFormatStates {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  code: boolean;
  quote: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  // href of the link under the cursor, if any
  link: string | null;
}

export interface SquireEditorApi {
  command: (command: string, value?: any) => void;
  // Swaps the signature block in place, leaving the rest of the document (and
  // the user's cursor) alone
  setSignature: (html: string) => void;
}

export const SIGNATURE_CLASS = "kanmail-signature";

// Always emit the wrapper, even for an empty signature, so a later swap has
// something to find. The <br> filler stops Squire collapsing the empty block.
export function wrapSignature(html: string): string {
  return `<div class="${SIGNATURE_CLASS}">${sanitizeHtml(html) || "<br>"}</div>`;
}

// The document an editor is mounted with: what the user types into, then the
// signature, then any quoted original after a blank line
export function buildComposeContent(body: string, signature: string, quote: string): string {
  return [
    body,
    wrapSignature(signature),
    quote ? `<div><br></div>${quote}` : "",
  ].join("");
}

export const defaultFormatStates: SquireFormatStates = {
  bold: false,
  italic: false,
  underline: false,
  code: false,
  quote: false,
  unorderedList: false,
  orderedList: false,
  link: null,
};

const SquireEditor = ({
  initialContent,
  onUpdate,
  // The parent renders its own format controls (the compose dock / quick
  // reply actions bar) using the exposed editor API + format states.
  onReady,
  onFormatStateChange,
  autoFocus,
}: {
  initialContent: string,
  onUpdate: (data: string) => void,
  onReady?: (api: SquireEditorApi) => void,
  onFormatStateChange?: (states: SquireFormatStates) => void,
  autoFocus?: boolean,
}) => {
  const editorRef = useRef(null);
  const squireRef: React.MutableRefObject<null | Squire> = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Initialize Squire editor
    const editor = new Squire(editorRef.current, {
      blockTag: 'div',
      blockAttributes: { 'class': 'paragraph' },
      tagAttributes: {
        ul: { 'class': 'UL' },
        ol: { 'class': 'OL' },
        li: { 'class': 'listItem' },
        a: { 'target': '_blank' },
        pre: {
          style: 'border-radius:3px;border:1px solid #ccc;padding:7px 10px;background:#f6f6f6;font-family:menlo,consolas,monospace;font-size:90%;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;'
        },
        code: {
          style: 'border-radius:3px;border:1px solid #ccc;padding:1px 3px;background:#f6f6f6;font-family:menlo,consolas,monospace;font-size:90%;'
        }
      }
    });

    editor.setHTML(initialContent)
    squireRef.current = editor;

    // Squire only fires "input" on user edits, so without this the parent's
    // html state stays empty until the first keystroke - sending without
    // typing would drop the quote and signature entirely.
    onUpdate(editor.getHTML());

    if (autoFocus) {
      editor.moveCursorToStart();
      editor.focus();
    }

    const getLinkHref = (range: Range): string | null => {
      const node = range.commonAncestorContainer;
      const element = node instanceof Element ? node : node.parentElement;
      const anchor = element?.closest('a');
      return anchor && editor.getRoot().contains(anchor) ? anchor.getAttribute('href') : null;
    };

    // Update format states on selection change
    const updateFormatStates = () => {
      const range = editor.getSelection();
      if (!range) return;

      const states: SquireFormatStates = {
        bold: editor.hasFormat('B'),
        italic: editor.hasFormat('I'),
        underline: editor.hasFormat('U'),
        code: editor.hasFormat('CODE'),
        quote: editor.getPath().includes('BLOCKQUOTE'),
        unorderedList: editor.getPath().includes('UL'),
        orderedList: editor.getPath().includes('OL'),
        link: getLinkHref(range),
      };
      if (onFormatStateChange) {
        onFormatStateChange(states);
      }
    };

    // Listen for selection changes
    editor.addEventListener('cursor', updateFormatStates);
    editor.addEventListener('pathChange', updateFormatStates);
    editor.addEventListener('select', updateFormatStates);

    // Handle paste image
    editor.addEventListener('pasteImage', function (event) {
      const items = [...event.detail.clipboardData.items];
      const imageItems = items.filter((item) => /image/.test(item.type));

      if (!imageItems.length) {
        return false;
      }

      let reader = new FileReader();
      reader.onload = (loadEvent) => {
        editor.insertImage(loadEvent.target!.result);
      }
      reader.readAsDataURL(imageItems[0].getAsFile());
    });

    editor.addEventListener("input", function () {
      onUpdate(editor.getHTML());
    })

    if (onReady) {
      onReady({
        command: handleCommand,
        setSignature: handleSetSignature,
      });
    }

    return () => {
      if (squireRef.current) {
        squireRef.current.destroy();
      }
    };
  }, []);

  const handleCommand = (command, value: any = undefined) => {
    if (squireRef.current && squireRef.current[command]) {
      if (value !== undefined) {
        squireRef.current[command](value);
      } else {
        squireRef.current[command]();
      }
      squireRef.current.focus();
      // Squire only fires "input" for typing, not for format commands, so the
      // parent would otherwise miss a link/format applied just before sending
      onUpdate(squireRef.current.getHTML());
    }
  };

  const handleSetSignature = (html: string) => {
    const editor = squireRef.current;
    const root = editorRef.current as HTMLElement | null;
    if (!editor || !root) {
      return;
    }

    // No marker means the user deleted the signature - respect that
    const existing = root.querySelector(`.${SIGNATURE_CLASS}`);
    if (!existing) {
      return;
    }

    existing.innerHTML = sanitizeHtml(html) || "<br>";
    onUpdate(editor.getHTML());
  };

  return (
    <div className="squire-editor-container">
      <div
        ref={editorRef}
        className="squire-editor"
      />
    </div>
  );
};

export default SquireEditor;
