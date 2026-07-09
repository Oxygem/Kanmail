import _ from "lodash";
import PropTypes from "prop-types";
import React from "react";

import { ALIAS_FOLDERS } from "../../constants.ts";

import { subscribe } from "../../stores/base.tsx";
import { getColumnMetaStore } from "../../stores/columns.ts";
import searchStore from "../../stores/search.js";
import settingsStore from "../../stores/settings.ts";
import { capitalizeFirstLetter } from "../../util/string.js";
import Tooltip from "../Tooltip.tsx";

interface IEmailColumnHeaderProps {
  id: string;
  index: number;
  getNewEmails: () => void;
  getMoreEmails: () => void;

  isSearching?: boolean;
  isLoading?: boolean;
  isSyncing?: boolean;

  currentAccount?: string;
  counts?: {
    [_: string]: number;
  };
}

class EmailColumnHeader extends React.Component<IEmailColumnHeaderProps> {
  handleClickDelete = () => {
    settingsStore.removeColumn(this.props.index);
  };

  handleClickMoveLeft = () => {
    settingsStore.moveColumn(this.props.index, -1);
  };

  handleClickMoveRight = () => {
    settingsStore.moveColumn(this.props.index, 1);
  };

  renderName() {
    const column = this.props.id;

    // If we're an alias folder - capitalize it
    const name = _.includes(ALIAS_FOLDERS, column)
      ? capitalizeFirstLetter(column)
      : column;

    if (this.props.isSearching) {
      return `${name} Search`;
    }
    return name;
  }

  renderLoadingIcons() {
    const icons: React.ReactElement[] = [];

    if (this.props.isLoading) {
      icons.push(<i className="loading fa fa-spinner fa-spin"></i>);
    }
    if (this.props.isSyncing) {
      icons.push(<i className="loading fa fa-refresh fa-spin" />);
    }

    return icons
  }

  renderMetaIcons() {
    const deleteIcon = (
      <Tooltip text="Delete column"><i
        className="delete fa fa-times"
        onClick={this.handleClickDelete}
      /></Tooltip>
    );

    const currentColumns = settingsStore.getCurrentColumns();

    let moveLeftIcon: React.ReactElement | null = null;
    if (this.props.index > 0) {
      moveLeftIcon = (
        <Tooltip text="Move column left"><i
          className="fa fa-chevron-left"
          onClick={this.handleClickMoveLeft}
        ></i></Tooltip>
      );
    }

    let moveRightIcon: React.ReactElement | null = null;
    if (this.props.index < currentColumns.length - 1) {
      moveRightIcon = (
        <Tooltip text="Move column right"><i
          className="fa fa-chevron-right"
          onClick={this.handleClickMoveRight}
        ></i></Tooltip>
      );
    }

    return (
      <div className="icons">
        <Tooltip text="Sync emails"><i
          className="refresh fa fa-refresh"
          onClick={this.props.getNewEmails}
        /></Tooltip>
        <Tooltip text="Load older emails"><i
          className="refresh fa fa-plus"
          onClick={this.props.getMoreEmails}
        /></Tooltip>
        {moveLeftIcon}
        {moveRightIcon}
        {deleteIcon}
      </div>
    );
  }

  renderMeta() {
    const totalAccounts = this.props.currentAccount
      ? 1
      : _.size(this.props.counts);

    // If any account has >1000 emails (hardcoded in folder.go!) we don't reliably track the full
    // UID list and size of the folder, so append "+" to the count.
    let accountHasMany = false;

    const totalEmails = _.reduce(
      this.props.counts,
      (memo, value, accountKey) => {
        if (this.props.currentAccount && accountKey !== this.props.currentAccount) {
          return memo;
        }
        memo += value;
        if (value > 1000) {
          accountHasMany = true;
        }
        return memo;
      },
      0
    );

    return (
      <div className="text">
        {totalEmails.toLocaleString()}{accountHasMany ? "+" : ""} emails in {totalAccounts}&nbsp;
        {totalAccounts > 1 ? "accounts" : "account"}
      </div>
    );
  }

  render() {
    return (
      <div className="header" data-tauri-drag-region>
        <h3 data-tauri-drag-region>
          {this.renderName()}
          {this.renderLoadingIcons()}

          <span className="meta">
            {this.renderMeta()}
            {this.renderMetaIcons()}
          </span>
        </h3>
      </div>
    );
  }
}

export default class EmailColumnHeaderWrapper extends EmailColumnHeader {
  wrappedEmailColumn: any;

  render() {
    const WrappedEmailColumnHeader = subscribe(
      getColumnMetaStore(this.props.id),
      [settingsStore, ["currentAccount"]],
      [searchStore, ["isSearching"]]
    )(EmailColumnHeader);

    return <WrappedEmailColumnHeader {...this.props} {...this.state} />;
  }
}
