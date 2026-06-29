import PropTypes from "prop-types";
import React from "react";

import Tooltip from "../../components/Tooltip.tsx";
import { subscribe } from "../../stores/base.tsx";
import { Thread } from "../../stores/emails/base.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import threadStore from "../../stores/thread.ts";
import { trackEvent } from "../../util/analytics.ts";
import ColumnSelect from "./ColumnSelect.tsx";

interface IRightbarProps extends Partial<ISettings> {
  thread?: Thread | null;
}

interface IRightbarState {
  isAddingColumn: boolean;
}

@subscribe(settingsStore)
@subscribe(threadStore)
export default class AddNewColumnForm extends React.Component<IRightbarProps, IRightbarState> {
  constructor(props) {
    super(props);

    this.state = {
      isAddingColumn: false,
    };
  }

  handleAddColumn = (name: string) => {
    settingsStore.addColumn(name);
    this.setState({ isAddingColumn: false });
    trackEvent("AddColumn");
  };

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

  render() {
    if (this.props.thread != null) {
      return null;
    }

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
            </a>
          </Tooltip>
        </form>
      </div>
    );
  }
}
