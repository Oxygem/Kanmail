import React from "react";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";

import keyboard from "../../keyboard.ts";

import { subscribe } from "../../stores/base.tsx";
import commandStore, { CommandOption, CommandPage } from "../../stores/command.ts";

interface ICommandBarProps {
  page: CommandPage;
  pageDepth: number;
}

class CommandBar extends React.Component<ICommandBarProps> {
  private releaseKeyboard: (() => void) | null = null;

  componentWillUnmount() {
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
    }
  }

  handleSelectChange = (option: CommandOption) => {
    const nextPage = this.props.page.onSelect(option);
    if (nextPage) {
      commandStore.push(nextPage);
    } else {
      this.handleClose();
    }
  };

  handleClose = () => {
    commandStore.close();
    // Release on the next tick so the *current* keyboard event finishes first.
    if (this.releaseKeyboard) {
      const release = this.releaseKeyboard;
      this.releaseKeyboard = null;
      setTimeout(release, 0);
    }
  };

  // Escape steps back a page (or closes at the root). Handled here rather
  // than via react-select's onMenuClose so the event can be stopped from
  // reaching both react-select's internal handling and the global window
  // listener, which would otherwise pop twice.
  handleKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key !== "Escape") {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();

    if (this.props.pageDepth > 1) {
      commandStore.pop();
    } else {
      this.handleClose();
    }
  };

  handleFocus = () => {
    if (!this.releaseKeyboard) {
      this.releaseKeyboard = keyboard.suspend("CommandBar");
    }
  };

  handleBlur = () => {
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
    }
  };

  render() {
    const { page, pageDepth } = this.props;
    const SelectComponent = page.creatable ? CreatableSelect : Select;

    return (
      <section id="control-background">
        <section id="control">
          <p>{page.header}</p>
          <SelectComponent
            // Remount on page change to reset the filter text and refocus
            key={pageDepth}
            id="control-input"
            classNamePrefix="react-select"
            options={page.options}
            placeholder={page.placeholder}
            value={null}
            autoFocus={true}
            openMenuOnFocus={true}
            closeMenuOnSelect={false}
            menuIsOpen={true}
            onMenuClose={this.handleClose}
            onChange={this.handleSelectChange}
            onKeyDown={this.handleKeyDown}
            onFocus={this.handleFocus}
            onBlur={this.handleBlur}
          />
        </section>
      </section>
    );
  }
}

interface ICommandBarWrapperProps {
  open: boolean;
  pages: CommandPage[];
}

@subscribe(commandStore)
export default class CommandBarWrapper extends React.Component<ICommandBarWrapperProps> {
  render() {
    if (!this.props.open) {
      return null;
    }

    return (
      <CommandBar
        page={this.props.pages[this.props.pages.length - 1]}
        pageDepth={this.props.pages.length}
      />
    );
  }
}
