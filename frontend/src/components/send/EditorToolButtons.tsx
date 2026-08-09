import React, { useEffect, useRef, useState } from "react";

import { SquireFormatStates } from "./SquireEditor.tsx";

const POPOVER_WIDTH = 320;
const POPOVER_EDGE_GAP = 12;

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return `mailto:${trimmed}`;
  }
  return `https://${trimmed}`;
}

// The shared text-format buttons rendered in the compose window dock and the
// quick reply actions bar.
const EditorToolButtons = ({
  formatStates,
  onCommand,
}: {
  formatStates: SquireFormatStates,
  onCommand: (command: string, value?: any) => void,
}) => {
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [linkPosition, setLinkPosition] = useState<{ left: number, bottom: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (linkPosition) {
      linkInputRef.current?.select();
    }
  }, [linkPosition]);

  const closeLinkPopover = () => setLinkPosition(null);

  const toggleLinkPopover = () => {
    if (linkPosition) {
      closeLinkPopover();
      return;
    }
    const button = linkButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    setLinkUrl(formatStates.link || "");
    // Positioned fixed and anchored to the button: both toolbars live inside
    // overflow:hidden containers that would clip an absolute popover
    setLinkPosition({
      left: Math.max(
        POPOVER_EDGE_GAP,
        Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - POPOVER_EDGE_GAP),
      ),
      bottom: window.innerHeight - rect.top + 8,
    });
  };

  const applyLink = () => {
    if (!linkUrl.trim()) return;
    onCommand("makeLink", normalizeUrl(linkUrl));
    closeLinkPopover();
  };

  const removeLink = () => {
    onCommand("removeLink");
    closeLinkPopover();
  };

  const handleLinkKeyDown = (ev: React.KeyboardEvent) => {
    // Both hosts listen for bare keys further up (the thread view closes the
    // quick reply on escape) - the popover owns the keyboard while it's open
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      applyLink();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      closeLinkPopover();
    }
  };

  return (
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
        ref={linkButtonRef}
        className={`tool-btn ${formatStates.link || linkPosition ? "active" : ""}`}
        title="Link"
        onClick={toggleLinkPopover}
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
      {linkPosition && (
        <>
          <div className="link-popover-cover" onClick={closeLinkPopover} />
          <div
            className="link-popover"
            style={{ left: linkPosition.left, bottom: linkPosition.bottom, width: POPOVER_WIDTH }}
          >
            <input
              ref={linkInputRef}
              type="text"
              value={linkUrl}
              placeholder="https://example.com"
              onChange={(ev) => setLinkUrl(ev.target.value)}
              onKeyDown={handleLinkKeyDown}
            />
            {formatStates.link && (
              <button type="button" className="remove" title="Remove link" onClick={removeLink}>
                <i className="fa fa-chain-broken" />
              </button>
            )}
            <button
              type="button"
              className="apply"
              disabled={!linkUrl.trim()}
              onClick={applyLink}
            >
              {formatStates.link ? "Update" : "Add"}
            </button>
          </div>
        </>
      )}
    </>
  );
};

export default EditorToolButtons;
