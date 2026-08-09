import React from "react";

import { Settings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard, {
  Binding,
  bindingsEqual,
  bindingToDisplayString,
} from "../../keyboard.ts";
import BindingCapture from "./BindingCapture.tsx";

interface IProps {
  system: Settings["system"];
  updateFn: (settings: Partial<Settings>) => void;
}

interface IState {
  capturingId: string | null;
  conflict: { shortcutId: string; description: string } | null;
  confirmingResetAll: boolean;
}

const SCOPE_LABELS: Record<string, string> = {
  always: "Anywhere",
  global: "App",
  thread: "Thread",
};

const SCOPE_ORDER = ["always", "global", "thread"] as const;

export default class KeyboardShortcutsTab extends React.Component<IProps, IState> {
  state: IState = {
    capturingId: null,
    conflict: null,
    confirmingResetAll: false,
  };

  private currentBinding(shortcutId: string): Binding | null {
    const bindings = keyboard.getBindingsFor(shortcutId);
    return bindings.length > 0 ? bindings[0] : null;
  }

  private isOverridden(shortcutId: string): boolean {
    const overrides = this.props.system.keyboardShortcuts;
    return !!overrides && shortcutId in overrides;
  }

  private findConflict(
    binding: Binding,
    selfId: string,
  ): { shortcutId: string; description: string } | null {
    for (const s of keyboard.getShortcuts()) {
      if (s.id === selfId) continue;
      for (const b of keyboard.getBindingsFor(s.id)) {
        if (bindingsEqual(b, binding)) {
          return { shortcutId: s.id, description: s.description };
        }
      }
    }
    return null;
  }

  private writeOverrides(
    mutate: (next: { [_ in string]?: Binding[] }) => void,
  ) {
    const current = this.props.system.keyboardShortcuts ?? {};
    const next: { [_ in string]?: Binding[] } = { ...current };
    mutate(next);
    this.props.updateFn({
      system: { ...this.props.system, keyboardShortcuts: next },
    });
  }

  private commitBinding = (shortcutId: string, binding: Binding) => {
    const conflict = this.findConflict(binding, shortcutId);
    if (conflict) {
      this.setState({ conflict });
      return;
    }

    const defaults = keyboard.getDefaultsFor(shortcutId);
    const matchesDefault =
      defaults.length === 1 && bindingsEqual(defaults[0], binding);

    this.writeOverrides((next) => {
      if (matchesDefault) {
        delete next[shortcutId];
      } else {
        next[shortcutId] = [binding];
      }
    });
    this.setState({ capturingId: null, conflict: null });
  };

  private disableShortcut = (shortcutId: string) => {
    this.writeOverrides((next) => {
      next[shortcutId] = [];
    });
  };

  private resetShortcut = (shortcutId: string) => {
    this.writeOverrides((next) => {
      delete next[shortcutId];
    });
  };

  private resetAll = () => {
    this.props.updateFn({
      system: { ...this.props.system, keyboardShortcuts: undefined },
    });
    this.setState({ capturingId: null, conflict: null, confirmingResetAll: false });
  };

  private startCapture = (shortcutId: string) => {
    this.setState({ capturingId: shortcutId, conflict: null, confirmingResetAll: false });
  };

  private cancelCapture = () => {
    this.setState({ capturingId: null, conflict: null });
  };

  private renderRow(shortcutId: string, description: string) {
    const binding = this.currentBinding(shortcutId);
    const overridden = this.isOverridden(shortcutId);
    const capturing = this.state.capturingId === shortcutId;

    let chip: React.ReactNode;
    if (capturing) {
      chip = (
        <BindingCapture
          onCommit={(b) => this.commitBinding(shortcutId, b)}
          onCancel={this.cancelCapture}
        />
      );
    } else if (binding) {
      chip = (
        <button
          type="button"
          className="shortcut-binding"
          onClick={() => this.startCapture(shortcutId)}
        >
          {bindingToDisplayString(binding)}
        </button>
      );
    } else {
      chip = (
        <button
          type="button"
          className="shortcut-binding disabled"
          onClick={() => this.startCapture(shortcutId)}
        >
          (disabled)
        </button>
      );
    }

    const showConflict =
      capturing && this.state.conflict !== null;

    return (
      <div className="shortcut-row" key={shortcutId}>
        <div className="shortcut-description">{description}</div>
        <div className="shortcut-controls">
          {chip}
          {binding && !capturing && (
            <button
              type="button"
              className="shortcut-disable"
              title="Disable this shortcut"
              onClick={() => this.disableShortcut(shortcutId)}
            >
              ×
            </button>
          )}
          {overridden && !capturing && (
            <a
              className="shortcut-reset"
              onClick={() => this.resetShortcut(shortcutId)}
            >
              Reset
            </a>
          )}
        </div>
        {showConflict && (
          <div className="shortcut-conflict">
            Already used by &ldquo;{this.state.conflict!.description}&rdquo;
          </div>
        )}
      </div>
    );
  }

  render() {
    const shortcuts = keyboard.getShortcuts();
    const byScope: Record<string, typeof shortcuts> = {
      always: [],
      global: [],
      thread: [],
    };
    for (const s of shortcuts) byScope[s.scope]?.push(s);

    return (
      <div className="content keyboard-shortcuts">
        {SCOPE_ORDER.map((scope) => {
          const items = byScope[scope];
          if (!items || items.length === 0) return null;
          return (
            <div className="group" key={scope}>
              <h3>{SCOPE_LABELS[scope]}</h3>
              {items.map((s) => this.renderRow(s.id, s.description))}
            </div>
          );
        })}
        <div className="group">
          <button
            type="button"
            className="red"
            onClick={this.state.confirmingResetAll
              ? this.resetAll
              : () => this.setState({ confirmingResetAll: true })}
          >
            {this.state.confirmingResetAll
              ? "Confirm reset all"
              : "Reset all to defaults"}
          </button>
          {this.state.confirmingResetAll && (
            <a
              className="shortcut-reset"
              onClick={() => this.setState({ confirmingResetAll: false })}
            >
              Cancel
            </a>
          )}
        </div>
      </div>
    );
  }
}
