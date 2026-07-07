import { ReactNode } from "react";

import { BaseStore } from "./base.tsx";

export interface CommandOption {
  value: string;
  label: string;
}

export type CommandOptions =
  | CommandOption[]
  | { label: string; options: CommandOption[] }[];

export interface CommandPage {
  header: ReactNode;
  options: CommandOptions;
  // CreatableSelect (folder/column pickers) vs plain Select (root commands)
  creatable?: boolean;
  placeholder?: string;
  // Return a page to drill into it, or nothing to close the bar. Must not
  // mutate the command store itself — the CommandBar component owns that.
  onSelect: (option: CommandOption) => CommandPage | void;
}

function makeDefaults() {
  return {
    open: false,
    pages: [] as CommandPage[],
  };
}

class CommandStore extends BaseStore {
  /*
        Global store driving the command bar overlay. Holds a stack of pages
        so root commands (cmd+k) can drill into sub-pages (move/copy/add
        column) and Escape can step back out.
    */

  constructor() {
    super();

    this.props = makeDefaults();
  }

  get currentPage(): CommandPage | null {
    return this.props.pages[this.props.pages.length - 1] || null;
  }

  open = (page: CommandPage) => {
    this.props = {
      open: true,
      pages: [page],
    };
    this.triggerUpdate();
  };

  push = (page: CommandPage) => {
    this.props.pages.push(page);
    this.triggerUpdate();
  };

  pop = () => {
    if (this.props.pages.length > 1) {
      this.props.pages.pop();
      this.triggerUpdate();
    } else {
      this.close();
    }
  };

  close = () => {
    if (this.props.open) {
      this.props = makeDefaults();
      this.triggerUpdate();
    }
  };
}

const commandStore = new CommandStore();
export default commandStore;
