import _ from "lodash";
import React from "react";

import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import { trackEvent } from "../../util/analytics.ts";
import { capitalizeFirstLetter } from "../../util/string.js";

interface IManageWorkflowsModalProps extends Partial<ISettings> {
  onClose: () => void;
}

interface IManageWorkflowsModalState {
  renaming: string | null;
  renameValue: string;
  creating: boolean;
  newName: string;
  dragName: string | null;
  dragOverName: string | null;
}

@subscribe(settingsStore)
export default class ManageWorkflowsModal extends React.Component<
  IManageWorkflowsModalProps,
  IManageWorkflowsModalState
> {
  private releaseKeyboard: (() => void) | null = null;

  constructor(props) {
    super(props);
    this.state = {
      renaming: null,
      renameValue: "",
      creating: false,
      newName: "",
      dragName: null,
      dragOverName: null,
    };
  }

  componentDidMount() {
    // Suspend the board keyboard shortcuts while the modal is open and handle
    // Escape ourselves.
    this.releaseKeyboard = keyboard.suspend("ManageWorkflowsModal");
    window.addEventListener("keydown", this.handleKeydown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeydown);
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
    }
  }

  handleKeydown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      this.props.onClose();
    }
  };

  displayName(name: string): string {
    return name === "" ? "Default" : name;
  }

  startRename = (name: string) => {
    this.setState({ renaming: name, renameValue: name });
  };

  submitRename = () => {
    const { renaming, renameValue } = this.state;
    if (renaming === null) {
      return;
    }
    settingsStore
      .renameColumnGroup(renaming, renameValue)
      .then(() => trackEvent("WorkflowRename"))
      .catch((e) => console.error("Failed to rename workflow", e));
    this.setState({ renaming: null, renameValue: "" });
  };

  cancelRename = () => this.setState({ renaming: null, renameValue: "" });

  handleDuplicate = (name: string) => {
    settingsStore
      .duplicateColumnGroup(name)
      .then(() => trackEvent("WorkflowDuplicate"))
      .catch((e) => console.error("Failed to duplicate workflow", e));
  };

  handleDelete = (name: string) => {
    settingsStore
      .deleteColumnGroup(name)
      .then(() => trackEvent("WorkflowDelete"))
      .catch((e) => console.error("Failed to delete workflow", e));
  };

  submitCreate = () => {
    const name = this.state.newName.trim();
    if (!name) {
      this.setState({ creating: false, newName: "" });
      return;
    }
    settingsStore
      .createColumnGroup(name)
      .then(() => trackEvent("WorkflowCreate"))
      .catch((e) => console.error("Failed to create workflow", e));
    this.setState({ creating: false, newName: "" });
  };

  handleDrop = (targetName: string) => {
    const { dragName } = this.state;
    this.setState({ dragName: null, dragOverName: null });
    if (!dragName || dragName === targetName) {
      return;
    }
    const names = _.filter(settingsStore.getColumnGroupNames(), (n) => n !== "");
    const from = names.indexOf(dragName);
    const to = names.indexOf(targetName);
    if (from < 0 || to < 0) {
      return;
    }
    const reordered = [...names];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragName);
    settingsStore
      .reorderColumnGroups(reordered)
      .then(() => trackEvent("WorkflowReorder"))
      .catch((e) => console.error("Failed to reorder workflows", e));
  };

  renderRow(name: string, current: string) {
    const isDefault = name === "";
    const isCurrent = name === current;
    const columns = settingsStore.getColumnGroupColumns(name);

    if (this.state.renaming === name) {
      return (
        <div className="wfm-row" key={name || "__default__"}>
          <span className="wfm-handle">
            <i className="fa fa-ellipsis-v"></i>
            <i className="fa fa-ellipsis-v"></i>
          </span>
          <div className="wfm-info">
            <input
              className="wfm-rename"
              autoFocus
              value={this.state.renameValue}
              onChange={(ev) => this.setState({ renameValue: ev.target.value })}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  this.submitRename();
                } else if (ev.key === "Escape") {
                  ev.stopPropagation();
                  this.cancelRename();
                }
              }}
              onBlur={this.submitRename}
            />
            <div className="wfm-chips">
              {_.map(columns, (c) => (
                <span className="chip" key={c}>
                  {capitalizeFirstLetter(c)}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`wfm-row ${this.state.dragOverName === name ? "drag-over" : ""}`}
        key={name || "__default__"}
        draggable={!isDefault}
        onDragStart={() => this.setState({ dragName: name })}
        onDragOver={(ev) => {
          ev.preventDefault();
          if (this.state.dragOverName !== name) {
            this.setState({ dragOverName: name });
          }
        }}
        onDragEnd={() => this.setState({ dragName: null, dragOverName: null })}
        onDrop={() => this.handleDrop(name)}
      >
        <span className={`wfm-handle ${isDefault ? "disabled" : ""}`}>
          <i className="fa fa-ellipsis-v"></i>
          <i className="fa fa-ellipsis-v"></i>
        </span>
        <div className="wfm-info">
          <div className="wfm-name-row">
            <span className="wfm-name">{this.displayName(name)}</span>
            {isCurrent && <span className="wfm-current">Current</span>}
          </div>
          <div className="wfm-chips">
            {_.map(columns, (c) => (
              <span className="chip" key={c}>
                {capitalizeFirstLetter(c)}
              </span>
            ))}
          </div>
        </div>
        <div className="wfm-actions">
          <button
            className="icon-btn"
            title="Rename"
            disabled={isDefault}
            onClick={() => this.startRename(name)}
          >
            <i className="fa fa-pencil"></i>
          </button>
          <button
            className="icon-btn"
            title="Duplicate"
            onClick={() => this.handleDuplicate(name)}
          >
            <i className="fa fa-clone"></i>
          </button>
          <button
            className="icon-btn"
            title="Delete"
            disabled={isDefault}
            onClick={() => this.handleDelete(name)}
          >
            <i className="fa fa-trash"></i>
          </button>
        </div>
      </div>
    );
  }

  render() {
    // The default ("") group is intentionally omitted here — it's only
    // reachable via the dropdown, not something to manage/rename/delete.
    const names = _.filter(settingsStore.getColumnGroupNames(), (n) => n !== "");
    const current = settingsStore.props.currentColumnGroup;

    return (
      <div className="workflow-modal-overlay" onClick={this.props.onClose}>
        <div className="workflow-modal" onClick={(ev) => ev.stopPropagation()}>
          <div className="wfm-head">
            <i className="fa fa-columns"></i>
            <h2>Manage workflows</h2>
            <button className="icon-btn" title="Close" onClick={this.props.onClose}>
              <i className="fa fa-times"></i>
            </button>
          </div>

          <div className="wfm-list">
            {_.map(names, (name) => this.renderRow(name, current))}
          </div>

          <div className="wfm-foot">
            {this.state.creating ? (
              <div className="wfm-create">
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
                      ev.stopPropagation();
                      this.setState({ creating: false, newName: "" });
                    }
                  }}
                  onBlur={this.submitCreate}
                />
              </div>
            ) : (
              <button
                className="btn-ghost"
                onClick={() => this.setState({ creating: true, newName: "" })}
              >
                <i className="fa fa-plus"></i> New workflow
              </button>
            )}
            <button className="btn-primary" onClick={this.props.onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }
}
