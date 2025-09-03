import DOMPurify from 'dompurify';
import React, { useEffect, useRef, useState } from 'react';
import Squire from "squire-rte";

// @ts-ignore
window.DOMPurify = DOMPurify;

const SquireEditor = ({
  initialContent,
  onUpdate
}: {
  initialContent: string,
  onUpdate: (data: string) => void
}) => {
  const editorRef = useRef(null);
  const squireRef: React.MutableRefObject<null | Squire> = useRef(null);
  const [formatStates, setFormatStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    code: false,
    quote: false,
    unorderedList: false,
    orderedList: false
  });

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

    // Update format states on selection change
    const updateFormatStates = () => {
      const range = editor.getSelection();
      if (!range) return;

      setFormatStates({
        bold: editor.hasFormat('B'),
        italic: editor.hasFormat('I'),
        underline: editor.hasFormat('U'),
        code: editor.hasFormat('CODE'),
        quote: editor.getPath().includes('BLOCKQUOTE'),
        unorderedList: editor.getPath().includes('UL'),
        orderedList: editor.getPath().includes('OL')
      });
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
      <div className="toolbar">
        <button
          className={`toolbar-btn ${formatStates.bold ? 'active' : ''}`}
          onClick={() => handleCommand(formatStates.bold ? 'removeBold' : 'bold')}
          title="Bold"
        >
          <i className="fa fa-bold"></i>
        </button>
        <button
          className={`toolbar-btn ${formatStates.italic ? 'active' : ''}`}
          onClick={() => handleCommand(formatStates.italic ? 'removeItalic' : 'italic')}
          title="Italic"
        >
          <i className="fa fa-italic"></i>
        </button>
        <button
          className={`toolbar-btn ${formatStates.underline ? 'active' : ''}`}
          onClick={() => handleCommand(formatStates.underline ? 'removeUnderline' : 'underline')}
          title="Underline"
        >
          <i className="fa fa-underline"></i>
        </button>
        <button
          className={`toolbar-btn ${formatStates.quote ? 'active' : ''}`}
          onClick={() => handleCommand(formatStates.quote ? 'decreaseQuoteLevel' : 'increaseQuoteLevel')}
          title="Quote"
        >
          <i className="fa fa-quote-left"></i>
        </button>
        <button
          className={`toolbar-btn ${formatStates.unorderedList ? 'active' : ''}`}
          onClick={() => handleCommand(formatStates.unorderedList ? 'removeList' : 'makeUnorderedList')}
          title="Bullet list"
        >
          <i className="fa fa-list-ul"></i>
        </button>
        <button
          className={`toolbar-btn ${formatStates.orderedList ? 'active' : ''}`}
          onClick={() => handleCommand(formatStates.orderedList ? 'removeList' : 'makeOrderedList')}
          title="Numbered list"
        >
          <i className="fa fa-list-ol"></i>
        </button>
        <button
          className={`toolbar-btn ${formatStates.code ? 'active' : ''}`}
          onClick={() => handleCommand(formatStates.code ? 'removeCode' : 'code')}
          title="Code"
        >
          <i className="fa fa-code"></i>
        </button>
      </div>

      <div
        ref={editorRef}
        className="squire-editor"
      />
    </div>
  );
};

export default SquireEditor;
