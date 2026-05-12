import React from "react";

import keyboard, { bindingToDisplayString } from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import cheatsheetStore from "../../stores/cheatsheet.ts";

interface ICheatsheetProps {
  open: boolean;
}

const SCOPE_LABELS: Record<string, string> = {
  always: "Anywhere",
  global: "App",
  thread: "Thread",
};

@subscribe(cheatsheetStore)
export default class Cheatsheet extends React.Component<ICheatsheetProps> {
  handleBackgroundClick = (ev: React.MouseEvent) => {
    if (ev.target === ev.currentTarget) {
      cheatsheetStore.close();
    }
  };

  renderShortcuts() {
    const shortcuts = keyboard.getShortcuts();
    const byScope: Record<string, typeof shortcuts> = {
      always: [],
      global: [],
      thread: [],
    };
    for (const s of shortcuts) {
      byScope[s.scope]?.push(s);
    }

    return ["always", "global", "thread"].map((scope) => {
      const items = byScope[scope];
      if (!items || items.length === 0) return null;
      return (
        <div className="cheatsheet-group" key={scope}>
          <h4>{SCOPE_LABELS[scope]}</h4>
          <table>
            <tbody>
              {items.map((shortcut) => {
                const bindings = keyboard.getBindingsFor(shortcut.id);
                return (
                  <tr key={shortcut.id}>
                    <td className="cheatsheet-keys">
                      {bindings.map((b, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="cheatsheet-sep">/</span>}
                          <kbd>{bindingToDisplayString(b)}</kbd>
                        </React.Fragment>
                      ))}
                    </td>
                    <td className="cheatsheet-description">
                      {shortcut.description}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    });
  }

  render() {
    if (!this.props.open) {
      return null;
    }

    return (
      <section
        id="cheatsheet-background"
        onClick={this.handleBackgroundClick}
      >
        <section id="cheatsheet">
          <header>
            <h3>Keyboard shortcuts</h3>
            <button
              type="button"
              className="cheatsheet-close"
              onClick={cheatsheetStore.close}
              aria-label="Close"
            >
              ×
            </button>
          </header>
          {this.renderShortcuts()}
        </section>
      </section>
    );
  }
}
