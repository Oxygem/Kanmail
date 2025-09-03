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

interface IRightbarProps extends Partial<ISettings> {
  thread?: Thread | null;
}

interface IRightbarState {
  addColumnInput: string | null;
  isAddingColumn: boolean;

  saveColumnGroupInput: string | null;
  isSavingColumnGroup: boolean;
}

@subscribe(settingsStore)
@subscribe(threadStore)
export default class AddNewColumnForm extends React.Component<IRightbarProps, IRightbarState> {
  constructor(props) {
    super(props);

    this.state = {
      addColumnInput: null,
      isAddingColumn: false,

      saveColumnGroupInput: null,
      isSavingColumnGroup: false,
    };
  }

  handleSaveAddColumn = (ev) => {
    ev.preventDefault();

    // Add the column, don't wait for settings to save
    settingsStore.addColumn(this.state.addColumnInput!);

    // Immediately load the first page of folder emails
    getEmailStore().getFolderEmails(this.state.addColumnInput!, {});

    // Reset the input
    this.setState({
      addColumnInput: "",
      isAddingColumn: false,
    });

    trackEvent("AddColumn")
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
      <input
        type="text"
        onChange={(ev) => (this.setState({ addColumnInput: ev.target.value }))}
        onFocus={keyboard.disable}
        onBlur={keyboard.enable}
        value={this.state.addColumnInput || ""}
        placeholder="Column name..."
        ref={(ref) => (ref ? ref.focus() : null)}
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
        onFocus={keyboard.disable}
        onBlur={keyboard.enable}
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

    return (
      <div id="add-column">
        <form onSubmit={this.handleSaveAddColumn}>
          {this.renderAddColumnInput()}
          <Tooltip text="Add new column" position={"left"}>
            <a
              className={this.state.isAddingColumn ? "active" : ""}
              onClick={() => (this.setState({
                isAddingColumn: !this.state.isAddingColumn,
                addColumnInput: null,
              }))}
            >
              <i className="fa fa-plus"></i>
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
