import _ from "lodash";
import React from "react";
import CreatableSelect from "react-select/creatable";

import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import filterStore from "../../stores/filters.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";

const STANDARD_ALIASES = ["sent", "archive", "important", "flagged", "drafts"];

interface IProps extends Partial<ISettings> {
  folderNames?: string[];
  onAdd: (name: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  defaultMenuIsOpen?: boolean;
  placeholder?: string;
  className?: string;
}

@subscribe(settingsStore)
@subscribe(filterStore)
export default class ColumnSelect extends React.Component<IProps> {
  getOptions() {
    const current = settingsStore.getCurrentColumns();
    const userFolders = this.props.folderNames || [];
    const all = _.uniq([...STANDARD_ALIASES, ...userFolders]);
    return _.without(all, ...current).map((name) => ({ value: name, label: name }));
  }

  handleChange = (option: any) => {
    if (!option) return;
    const value = (option.value || option.label || "").trim();
    if (!value) return;
    if (_.includes(settingsStore.getCurrentColumns(), value)) return;
    this.props.onAdd(value);
  };

  handleBlur = () => {
    keyboard.enable();
    this.props.onBlur?.();
  };

  render() {
    return (
      <CreatableSelect
        className={this.props.className}
        classNamePrefix="react-select"
        options={this.getOptions()}
        autoFocus={this.props.autoFocus}
        defaultMenuIsOpen={this.props.defaultMenuIsOpen}
        placeholder={this.props.placeholder || "Add a column..."}
        onChange={this.handleChange}
        onFocus={keyboard.disable}
        onBlur={this.handleBlur}
        value={null}
      />
    );
  }
}
