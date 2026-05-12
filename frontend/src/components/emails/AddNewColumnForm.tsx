import _ from "lodash";
import PropTypes from "prop-types";
import React from "react";

import Tooltip from "../../components/Tooltip.tsx";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import { Thread } from "../../stores/emails/base.ts";
import { getEmailStore } from "../../stores/emails/controller.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import threadStore from "../../stores/thread.ts";
import { trackEvent } from "../../util/analytics.ts";
import ColumnSelect from "./ColumnSelect.tsx";

interface IRightbarProps extends Partial<ISettings> {
  thread?: Thread | null;
}

interface IRightbarState {
  isAddingColumn: boolean;

  saveColumnGroupInput: string | null;
  isSavingColumnGroup: boolean;
}

@subscribe(settingsStore)
@subscribe(threadStore)
export default class AddNewColumnForm extends React.Component<IRightbarProps, IRightbarState> {
  private releaseSaveInput: (() => void) | null = null;

  constructor(props) {
    super(props);

    this.state = {
      isAddingColumn: false,

      saveColumnGroupInput: null,
      isSavingColumnGroup: false,
    };
  }

  componentWillUnmount() {
    if (this.releaseSaveInput) {
      this.releaseSaveInput();
      this.releaseSaveInput = null;
    }
  }

  handleSaveInputFocus = () => {
    if (!this.releaseSaveInput) {
      this.releaseSaveInput = keyboard.suspend("AddNewColumnForm.save");
    }
  };

  handleSaveInputBlur = () => {
    if (this.releaseSaveInput) {
      this.releaseSaveInput();
      this.releaseSaveInput = null;
    }
  };

  handleAddColumn = (name: string) => {
    settingsStore.addColumn(name);
    this.setState({ isAddingColumn: false });
    trackEvent("AddColumn");
  };

  handleSaveColumnGroup = (ev) => {
    ev.preventDefault();

    settingsStore.saveColumnGroup(this.state.saveColumnGroupInput!).then(() => (this.setState({
      isSavingColumnGroup: false,
      saveColumnGroupInput: null,
    })));

    trackEvent("SaveColumnGroup")
  }

  renderAddColumnInput() {
    if (!this.state.isAddingColumn) {
      return null;
    }

    return (
      <ColumnSelect
        className="add-column-select"
        autoFocus={true}
        defaultMenuIsOpen={true}
        placeholder="Column name..."
        onAdd={this.handleAddColumn}
        onBlur={() => this.setState({ isAddingColumn: false })}
      />
    );
  }

  renderSaveColumnGroupForm() {
    if (!this.state.isSavingColumnGroup) {
      return null;
    }

    return (
      <input
        type="text"
        onChange={(ev) => (this.setState({ saveColumnGroupInput: ev.target.value }))}
        onFocus={this.handleSaveInputFocus}
        onBlur={this.handleSaveInputBlur}
        value={this.state.saveColumnGroupInput || ""}
        placeholder="Workflow name..."
        ref={(ref) => (ref ? ref.focus() : null)}
      />
    );
  }

  render() {
    if (this.props.thread != null) {
      return null;
    }

    const showLabels = settingsStore.getCurrentColumns().length == 2;

    return (
      <div id="add-column">
        <form onSubmit={(ev) => ev.preventDefault()}>
          {this.renderAddColumnInput()}
          <Tooltip text="Add new column" position={"left"}>
            <a
              className={this.state.isAddingColumn ? "active" : ""}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => (this.setState({
                isAddingColumn: !this.state.isAddingColumn,
              }))}
            >
              <i className="fa fa-plus"></i>
              {showLabels && <span className="label">Add Column</span>}
            </a>
          </Tooltip>
        </form>

        {(settingsStore.getCurrentColumns().length > 1 && this.props.currentColumnGroup == "") && <form onSubmit={this.handleSaveColumnGroup}>
          {this.renderSaveColumnGroupForm()}
          <Tooltip text="Save new workflow view" position={"left"}>
            <a
              className={this.state.isSavingColumnGroup ? "active" : ""}
              onClick={() => (this.setState({
                isSavingColumnGroup: !this.state.isSavingColumnGroup,
                saveColumnGroupInput: null,
              }))}
            >
              <i className="fa fa-columns"></i>
              {showLabels && <span className="label">Save Workflow</span>}
            </a>
          </Tooltip>
        </form>}

        {_.map(this.props.columnGroups, (_, group) => {
          if (group == "") {
            return null;
          }
          if (group == this.props.currentColumnGroup) {
            return <div>
              <form>
                <Tooltip text={`Close workflow view: ${group}`} position={"left"}>
                  <a className="active" onClick={() => {
                    settingsStore.closeColumnGroup();
                    trackEvent("CloseColumnGroup");
                  }}>
                    <strong>{group[0]}</strong>
                  </a>
                </Tooltip>
              </form>
              <form className="delete-group">
                <Tooltip text={`Delete workflow view: ${this.props.currentColumnGroup}`} position={"left"}>
                  <a onClick={() => {
                    settingsStore.deleteCurrentColumnGroup();
                    trackEvent("DeleteColumnGroup");
                  }}>
                    <i className="fa fa-times"></i>
                  </a>
                </Tooltip>
              </form>
            </div>
          }

          return <form>
            <Tooltip text={`Show workflow view: ${group}`} position={"left"}>
              <a onClick={() => {
                settingsStore.selectColumnGroup(group);
                trackEvent("ShowColumnGroup");
              }}>
                <strong>{group[0]}</strong>
              </a>
            </Tooltip>
          </form>
        })}
      </div>
    );
  }
}
