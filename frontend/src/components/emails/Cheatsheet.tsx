import React from "react";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
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

  handleClickCustomize = () => {
    cheatsheetStore.close();
    AppService.OpenSettingsWindow("shortcuts");
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
                    <td className="cheatsheet-description">
                      {shortcut.description}
                    </td>
                    <td className="cheatsheet-keys">
                      {bindings.map((b, i) => (
                        <kbd key={i}>{bindingToDisplayString(b)}</kbd>
                      ))}
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
          <div className="cheatsheet-head">
            <i className="fa fa-keyboard-o" />
            <h3>Keyboard shortcuts</h3>
            <button
              type="button"
              className="icon-btn"
              onClick={cheatsheetStore.close}
              aria-label="Close"
            >
              <i className="fa fa-times" />
            </button>
          </div>
          <div className="cheatsheet-body">
            {this.renderShortcuts()}
          </div>
          <div className="cheatsheet-foot">
            <span className="cheatsheet-hint">
              Press <kbd>?</kbd> any time to show this
            </span>
            <button
              type="button"
              className="btn-ghost"
              onClick={this.handleClickCustomize}
            >
              <i className="fa fa-sliders" />
              Customize
            </button>
          </div>
        </section>
      </section>
    );
  }
}
