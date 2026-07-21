import DOMPurify from 'dompurify';
import React, { useEffect, useRef } from 'react';
import Squire from "squire-rte";

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
}

export interface SquireEditorApi {
  command: (command: string, value?: any) => void;
  promptCommand: (command: string, promptText: string) => void;
}

export const defaultFormatStates: SquireFormatStates = {
  bold: false,
  italic: false,
  underline: false,
  code: false,
  quote: false,
  unorderedList: false,
  orderedList: false,
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

    if (autoFocus) {
      editor.moveCursorToStart();
      editor.focus();
    }

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
        orderedList: editor.getPath().includes('OL')
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
      onReady({ command: handleCommand, promptCommand: handlePromptCommand });
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
    }
  };

  const handlePromptCommand = (command, promptText) => {
    const value = prompt(promptText);
    if (value !== null) {
      handleCommand(command, value);
    }
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
