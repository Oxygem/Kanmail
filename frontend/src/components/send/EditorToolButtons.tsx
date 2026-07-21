import React from "react";

import { SquireFormatStates } from "./SquireEditor.tsx";

// The shared text-format buttons rendered in the compose window dock and the
// quick reply actions bar.
const EditorToolButtons = ({
  formatStates,
  onCommand,
  onPromptCommand,
}: {
  formatStates: SquireFormatStates,
  onCommand: (command: string, value?: any) => void,
  onPromptCommand: (command: string, promptText: string) => void,
}) => (
  <>
    <button
      type="button"
      className={`tool-btn ${formatStates.bold ? "active" : ""}`}
      title="Bold"
      onClick={() => onCommand(formatStates.bold ? "removeBold" : "bold")}
    >
      <i className="fa fa-bold" />
    </button>
    <button
      type="button"
      className={`tool-btn ${formatStates.italic ? "active" : ""}`}
      title="Italic"
      onClick={() => onCommand(formatStates.italic ? "removeItalic" : "italic")}
    >
      <i className="fa fa-italic" />
    </button>
    <button
      type="button"
      className={`tool-btn ${formatStates.underline ? "active" : ""}`}
      title="Underline"
      onClick={() => onCommand(formatStates.underline ? "removeUnderline" : "underline")}
    >
      <i className="fa fa-underline" />
    </button>
    <button
      type="button"
      className={`tool-btn ${formatStates.quote ? "active" : ""}`}
      title="Quote"
      onClick={() => onCommand(formatStates.quote ? "decreaseQuoteLevel" : "increaseQuoteLevel")}
    >
      <i className="fa fa-quote-left" />
    </button>
    <button
      type="button"
      className="tool-btn"
      title="Link"
      onClick={() => onPromptCommand("makeLink", "Enter a URL:")}
    >
      <i className="fa fa-link" />
    </button>
    <button
      type="button"
      className={`tool-btn ${formatStates.unorderedList ? "active" : ""}`}
      title="Bullet list"
      onClick={() => onCommand(formatStates.unorderedList ? "removeList" : "makeUnorderedList")}
    >
      <i className="fa fa-list-ul" />
    </button>
    <button
      type="button"
      className={`tool-btn ${formatStates.orderedList ? "active" : ""}`}
      title="Numbered list"
      onClick={() => onCommand(formatStates.orderedList ? "removeList" : "makeOrderedList")}
    >
      <i className="fa fa-list-ol" />
    </button>
    <button
      type="button"
      className={`tool-btn ${formatStates.code ? "active" : ""}`}
      title="Code"
      onClick={() => onCommand(formatStates.code ? "removeCode" : "code")}
    >
      <i className="fa fa-code" />
    </button>
  </>
);

export default EditorToolButtons;
