import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from "@tiptap/starter-kit";
import React from "react";

export default (props: {
  initialContent: string;
  onUpdate: (_: { editor: Editor }) => void;
}) => {
  const editor = useEditor({
    extensions: [StarterKit, TableKit, Image],
    content: props.initialContent,
    onUpdate: props.onUpdate,
  })

  return (
    <>
      {editor && (
        <BubbleMenu className="bubble-menu" editor={editor}>
          <button
            onClick={(ev) => {
              ev.preventDefault();
              editor.chain().focus().toggleBold().run()
            }}
            className={editor.isActive('bold') ? 'is-active' : ''}
          >
            Bold
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'is-active' : ''}
          >
            Italic
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive('strike') ? 'is-active' : ''}
          >
            Strike
          </button>
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />
    </>
  );
}
