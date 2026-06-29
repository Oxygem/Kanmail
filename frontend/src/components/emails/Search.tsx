import _ from "lodash";
import React from "react";

import keyboard from "../../keyboard.ts";

import { subscribe } from "../../stores/base.tsx";
import emailStoreController from "../../stores/emails/controller.ts";
import searchStore from "../../stores/search.js";
import { trackEvent } from "../../util/analytics.ts";

interface ISearchProps {
  isSearching: boolean;
}

interface ISearchState {
  searchValue: string;
}

@subscribe([searchStore, ["isSearching"]])
export default class Search extends React.Component<ISearchProps, ISearchState> {
  executeSearch: () => void;
  input: HTMLInputElement | null;
  releaseKeyboard: (() => void) | null = null;

  constructor(props) {
    super(props);

    this.state = {
      searchValue: "",
    };

    this.executeSearch = _.debounce(this._executeSearch, 500);
  }

  componentDidMount() {
    searchStore.setFocusHandler(() => this.input?.focus());
  }

  componentWillUnmount() {
    searchStore.setFocusHandler(null);
    this.releaseKeyboardIfHeld();
  }

  releaseKeyboardIfHeld() {
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
    }
  }

  _executeSearch = () => {
    if (this.state.searchValue) {
      emailStoreController.search(this.state.searchValue);
    }
  };

  handleFocus = () => {
    // Suspend keyboard shortcuts so typing lands in the field, but don't flip
    // into search mode until there's actually a query (see handleInputChange).
    if (!this.releaseKeyboard) {
      this.releaseKeyboard = keyboard.suspend("Search");
    }
  };

  handleBlur = () => {
    this.releaseKeyboardIfHeld();
    // Keep the search results visible while a query is present (so the user can
    // navigate them with the keyboard); only drop back to the inbox once empty.
    if (!this.state.searchValue) {
      searchStore.close();
    }
  };

  handleInputChange = (ev) => {
    const value = ev.target.value;
    this.setState({ searchValue: value });

    if (value) {
      if (!this.props.isSearching) {
        trackEvent("ToolbarToggleSearch");
      }
      searchStore.open();
      this.executeSearch();
    } else {
      searchStore.close();
    }
  };

  handleKeyDown = (ev) => {
    if (ev.key === "Escape") {
      this.clearSearch();
    }
  };

  clearSearch = () => {
    this.setState({ searchValue: "" });
    searchStore.close();
    this.input?.blur();
  };

  render() {
    return (
      <div className={`km-search ${this.props.isSearching ? "open" : ""}`}>
        <i className="fa fa-search"></i>
        <input
          type="text"
          value={this.state.searchValue}
          onChange={this.handleInputChange}
          onFocus={this.handleFocus}
          onBlur={this.handleBlur}
          onKeyDown={this.handleKeyDown}
          placeholder="Search all mail"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          ref={(input) => {
            this.input = input;
          }}
        />
        {this.state.searchValue && (
          <i className="fa fa-times clear" onClick={this.clearSearch}></i>
        )}
      </div>
    );
  }
}
