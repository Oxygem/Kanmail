import React from "react";

import keyboard, { Binding, bindingFromEvent } from "../../keyboard.ts";

interface IBindingCaptureProps {
  onCommit: (binding: Binding) => void;
  onCancel: () => void;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

export default class BindingCapture extends React.Component<IBindingCaptureProps> {
  private release: (() => void) | null = null;

  componentDidMount() {
    this.release = keyboard.suspend("BindingCapture");
    // Capture phase so we beat the keyboard module's window listener AND
    // any input element that might be focused.
    window.addEventListener("keydown", this.handleKeyDown, true);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown, true);
    if (this.release) {
      this.release();
      this.release = null;
    }
  }

  private handleKeyDown = (ev: KeyboardEvent) => {
    if (MODIFIER_KEYS.has(ev.key)) {
      // Wait for the actual key — modifier-only bindings make no sense.
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    const hasModifier = ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey;
    if (ev.key === "Escape" && !hasModifier) {
      this.props.onCancel();
      return;
    }

    this.props.onCommit(bindingFromEvent(ev));
  };

  render() {
    return (
      <span className="shortcut-binding capturing">
        Press a key… (Esc to cancel)
      </span>
    );
  }
}
