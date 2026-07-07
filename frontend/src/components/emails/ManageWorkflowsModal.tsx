import _ from "lodash";
import React from "react";

import { ColumnGroup } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import { trackEvent } from "../../util/analytics.ts";
import { capitalizeFirstLetter } from "../../util/string.js";

interface IManageWorkflowsModalProps extends Partial<ISettings> {
  onClose: () => void;
}

interface IManageWorkflowsModalState {
  renamingIndex: number | null;
  renameValue: string;
  creating: boolean;
  newName: string;
  dragIndex: number | null;
  dragOverIndex: number | null;
  dragArmedIndex: number | null;
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
      renamingIndex: null,
      renameValue: "",
      creating: false,
      newName: "",
      dragIndex: null,
      dragOverIndex: null,
      dragArmedIndex: null,
    };
  }

  componentDidMount() {
    // Suspend the board keyboard shortcuts while the modal is open and handle
    // Escape ourselves.
    this.releaseKeyboard = keyboard.suspend("ManageWorkflowsModal");
    window.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("mouseup", this.disarmDrag);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener("mouseup", this.disarmDrag);
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

  disarmDrag = () => {
    if (this.state.dragArmedIndex !== null) {
      this.setState({ dragArmedIndex: null });
    }
  };

  startRename = (index: number, name: string) => {
    this.setState({ renamingIndex: index, renameValue: name });
  };

  submitRename = () => {
    const { renamingIndex, renameValue } = this.state;
    if (renamingIndex === null) {
      return;
    }
    settingsStore
      .renameColumnGroup(renamingIndex, renameValue)
      .then(() => trackEvent("WorkflowRename"))
      .catch((e) => console.error("Failed to rename workflow", e));
    this.setState({ renamingIndex: null, renameValue: "" });
  };

  cancelRename = () => this.setState({ renamingIndex: null, renameValue: "" });

  handleDuplicate = (index: number) => {
    settingsStore
      .duplicateColumnGroup(index)
      .then(() => trackEvent("WorkflowDuplicate"))
      .catch((e) => console.error("Failed to duplicate workflow", e));
  };

  handleDelete = (index: number) => {
    settingsStore
      .deleteColumnGroup(index)
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

  handleDrop = (targetIndex: number) => {
    const { dragIndex } = this.state;
    this.setState({ dragIndex: null, dragOverIndex: null, dragArmedIndex: null });
    if (dragIndex === null || dragIndex === targetIndex) {
      return;
    }
    settingsStore
      .reorderColumnGroups(dragIndex, targetIndex)
      .then(() => trackEvent("WorkflowReorder"))
      .catch((e) => console.error("Failed to reorder workflows", e));
  };

  dragOverClass(index: number): string {
    const { dragIndex, dragOverIndex } = this.state;
    if (dragIndex === null || dragOverIndex !== index || dragIndex === index) {
      return "";
    }
    return dragIndex > index ? "drag-over-above" : "drag-over-below";
  }

  renderChips(group: ColumnGroup) {
    return (
      <div className="wfm-chips">
        {_.map(group.columns, (c, i) => (
          <span className="chip" key={i}>
            {capitalizeFirstLetter(c)}
          </span>
        ))}
      </div>
    );
  }

  renderRow(group: ColumnGroup, index: number, count: number) {
    const isCurrent = index === settingsStore.props.currentColumnGroupIndex;

    if (this.state.renamingIndex === index) {
      return (
        <div className="wfm-row" key={index}>
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
            {this.renderChips(group)}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`wfm-row ${this.dragOverClass(index)}`}
        key={index}
        draggable={this.state.dragArmedIndex === index}
        onDragStart={(ev) => {
          // Keep the drag away from react-dnd's window-level HTML5 backend
          // (EmailsApp's DragDropContext), which otherwise forces
          // dropEffect "none" over non-react-dnd targets and blocks the drop.
          ev.stopPropagation();
          ev.dataTransfer.setData("text/plain", String(index));
          ev.dataTransfer.effectAllowed = "move";
          this.setState({ dragIndex: index });
        }}
        onDragEnter={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        }}
        onDragOver={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          ev.dataTransfer.dropEffect = "move";
          if (this.state.dragOverIndex !== index) {
            this.setState({ dragOverIndex: index });
          }
        }}
        onDragEnd={() =>
          this.setState({ dragIndex: null, dragOverIndex: null, dragArmedIndex: null })
        }
        onDrop={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.handleDrop(index);
        }}
      >
        <span
          className="wfm-handle"
          title="Drag to reorder"
          onMouseDown={() => this.setState({ dragArmedIndex: index })}
        >
          <i className="fa fa-ellipsis-v"></i>
          <i className="fa fa-ellipsis-v"></i>
        </span>
        <div className="wfm-info">
          <div className="wfm-name-row">
            <span className="wfm-name">{group.name}</span>
            {isCurrent && <span className="wfm-current">Current</span>}
          </div>
          {this.renderChips(group)}
        </div>
        <div className="wfm-actions">
          <button
            className="icon-btn"
            title="Rename"
            onClick={() => this.startRename(index, group.name)}
          >
            <i className="fa fa-pencil"></i>
          </button>
          <button
            className="icon-btn"
            title="Duplicate"
            onClick={() => this.handleDuplicate(index)}
          >
            <i className="fa fa-clone"></i>
          </button>
          <button
            className="icon-btn"
            title="Delete"
            disabled={count <= 1}
            onClick={() => this.handleDelete(index)}
          >
            <i className="fa fa-trash"></i>
          </button>
        </div>
      </div>
    );
  }

  render() {
    const groups = settingsStore.props.columnGroups;

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
            {_.map(groups, (group, index) => this.renderRow(group, index, groups.length))}
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
