import _ from "lodash";
import React from "react";

import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import { trackEvent } from "../../util/analytics.ts";
import { capitalizeFirstLetter } from "../../util/string.js";
import ManageWorkflowsModal from "./ManageWorkflowsModal.tsx";

interface IWorkflowSwitcherState {
  open: boolean;
  manageOpen: boolean;
  creating: boolean;
  newName: string;
  pos: { top: number; left: number } | null;
}

@subscribe(settingsStore)
export default class WorkflowSwitcher extends React.Component<Partial<ISettings>, IWorkflowSwitcherState> {
  private buttonRef = React.createRef<HTMLButtonElement>();
  private releaseKeyboard: (() => void) | null = null;

  constructor(props) {
    super(props);
    this.state = {
      open: false,
      manageOpen: false,
      creating: false,
      newName: "",
      pos: null,
    };
  }

  componentDidMount() {
    window.addEventListener("keydown", this.handleKeydown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeydown);
    this.release();
  }

  suspend = () => {
    if (!this.releaseKeyboard) {
      this.releaseKeyboard = keyboard.suspend("WorkflowSwitcher");
    }
  };

  release = () => {
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
    }
  };

  // Cmd/Ctrl + 1-9 switches to the Nth named workflow (the default is excluded).
  handleKeydown = (ev: KeyboardEvent) => {
    if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.shiftKey) {
      return;
    }
    if (!/^[1-9]$/.test(ev.key) || keyboard.isSuspended()) {
      return;
    }
    const named = _.filter(settingsStore.getColumnGroupNames(), (n) => n !== "");
    const idx = parseInt(ev.key, 10) - 1;
    if (idx >= named.length) {
      return;
    }
    ev.preventDefault();
    settingsStore.switchColumnGroup(named[idx]);
    trackEvent("WorkflowShortcutSwitch");
  };

  displayName(name: string): string {
    return name === "" ? "Default" : name;
  }

  columnsSubtitle(name: string): string {
    return _.map(settingsStore.getColumnGroupColumns(name), capitalizeFirstLetter).join(" · ");
  }

  toggleOpen = () => {
    if (this.state.open) {
      this.close();
      return;
    }
    const rect = this.buttonRef.current?.getBoundingClientRect();
    this.setState({
      open: true,
      creating: false,
      pos: rect ? { top: rect.bottom + 6, left: rect.left } : null,
    });
  };

  close = () => {
    this.release();
    this.setState({ open: false, creating: false, newName: "" });
  };

  switchTo = (name: string) => {
    settingsStore.switchColumnGroup(name);
    trackEvent("WorkflowSwitch");
    this.close();
  };

  startCreate = () => {
    this.suspend();
    this.setState({ creating: true, newName: "" });
  };

  submitCreate = () => {
    const name = this.state.newName.trim();
    if (!name) {
      return;
    }
    settingsStore
      .createColumnGroup(name)
      .then(() => {
        trackEvent("WorkflowCreate");
        this.close();
      })
      .catch((e) => console.error("Failed to create workflow", e));
  };

  openManage = () => {
    this.release();
    this.setState({ open: false, creating: false, manageOpen: true });
  };

  closeManage = () => this.setState({ manageOpen: false });

  renderItem(name: string, shortcut: number | null, current: string) {
    const isCurrent = name === current;
    return (
      <a
        key={name || "__default__"}
        className={`wf-item ${isCurrent ? "current" : ""}`}
        onClick={() => this.switchTo(name)}
      >
        <i className="fa fa-columns wf-icon"></i>
        <div className="wf-text">
          <div className="wf-name">{this.displayName(name)}</div>
          <div className="wf-sub">{this.columnsSubtitle(name)}</div>
        </div>
        {isCurrent ? (
          <i className="fa fa-check wf-check"></i>
        ) : shortcut !== null ? (
          <span className="kbd">⌘{shortcut}</span>
        ) : null}
      </a>
    );
  }

  renderDropdown() {
    const names = settingsStore.getColumnGroupNames();
    const current = settingsStore.props.currentColumnGroup;
    const style = this.state.pos
      ? { top: this.state.pos.top, left: this.state.pos.left }
      : undefined;

    // The default ("") group has no keyboard shortcut; named workflows are
    // numbered ⌘1..N in order.
    let namedCount = 0;
    const items = _.map(names, (name) => {
      const shortcut = name === "" ? null : (namedCount += 1);
      return this.renderItem(name, shortcut, current);
    });

    return (
      <>
        <div className="workflow-backdrop" onClick={this.close}></div>
        <div className="workflow-dropdown" style={style}>
          <div className="wf-head">Switch workflow</div>
          {items}
          <div className="wf-divider"></div>
          {this.state.creating ? (
            <div className="wf-create">
              <i className="fa fa-plus"></i>
              <input
                autoFocus
                value={this.state.newName}
                placeholder="Workflow name…"
                onChange={(ev) => this.setState({ newName: ev.target.value })}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    this.submitCreate();
                  } else if (ev.key === "Escape") {
                    this.setState({ creating: false });
                    this.release();
                  }
                }}
              />
            </div>
          ) : (
            <a className="wf-action" onClick={this.startCreate}>
              <i className="fa fa-plus"></i> New workflow
            </a>
          )}
          <a className="wf-action" onClick={this.openManage}>
            <i className="fa fa-sliders"></i> Manage workflows…
          </a>
        </div>
      </>
    );
  }

  render() {
    const current = settingsStore.props.currentColumnGroup;

    return (
      <div className="workflow-switcher">
        <button
          ref={this.buttonRef}
          className={`wf-button ${this.state.open ? "open" : ""}`}
          onClick={this.toggleOpen}
        >
          <i className="fa fa-columns wf-button-icon"></i>
          <span className="wf-button-name">{this.displayName(current)}</span>
          <i className="fa fa-chevron-down wf-caret"></i>
        </button>
        {this.state.open && this.renderDropdown()}
        {this.state.manageOpen && <ManageWorkflowsModal onClose={this.closeManage} />}
      </div>
    );
  }
}
