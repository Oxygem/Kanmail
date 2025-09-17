import React from "react";
import CreatableSelect from "react-select/creatable";

import keyboard from "../../keyboard.ts";

import { subscribe } from "../../stores/base.tsx";
import controlStore from "../../stores/control.ts";

interface IControlInputProps {
  inputHandler: (_: string) => {};
  selectOptions: any[];
  header: any;
}

interface IControlInputState {
  inputValue: string;
}

class ControlInput extends React.Component<IControlInputProps, IControlInputState> {
  keyboardWasEnabled: boolean;

  constructor(props: IControlInputProps) {
    super(props);

    this.keyboardWasEnabled = !keyboard.disabled;

    this.state = {
      inputValue: "",
    };
  }

  handleSelectChange = (value: string) => {
    this.props.inputHandler(value);
    this.handleClose();
  };

  handleFormSubmit = (ev) => {
    ev.preventDefault();
    this.props.inputHandler(this.state.inputValue);
    this.handleClose();
  };

  handleClose = () => {
    controlStore.close(false);
    if (this.keyboardWasEnabled) {
      setTimeout(keyboard.enable, 0); // prevent the *current* keyboard event executing
    }
  };

  render() {
    const { header, selectOptions } = this.props;

    let input;

    if (selectOptions) {
      input = (
        <CreatableSelect
          id="control-input"
          classNamePrefix="react-select"
          options={selectOptions}
          autoFocus={true}
          openMenuOnFocus={true}
          closeMenuOnSelect={false}
          menuIsOpen={true}
          onMenuClose={this.handleClose}
          onChange={this.handleSelectChange}
          onFocus={this.keyboardWasEnabled ? keyboard.disable : undefined}
          onBlur={this.keyboardWasEnabled ? keyboard.enable : undefined}
        />
      );
    } else {
      input = (
        <form onSubmit={this.handleFormSubmit}>
          <input
            id="control-input"
            value={this.state.inputValue}
            onChange={(ev) => this.setState({ inputValue: ev.target.value })}
            ref={(input) => input && input.focus()}
          />
        </form>
      );
    }

    return (
      <section id="control-background">
        <section id="control">
          <p>{header}</p>
          {input}
        </section>
      </section>
    );
  }
}

interface IControlInputWrapperProps {
  open: boolean;
  extraProps: any;
  inputHandler: (_: string) => {};
}

@subscribe(controlStore)
export default class ControlInputWrapper extends React.Component<IControlInputWrapperProps> {
  render() {
    if (!this.props.open) {
      return null;
    }

    return (
      <ControlInput
        inputHandler={this.props.inputHandler}
        {...this.props.extraProps}
      />
    );
  }
}
