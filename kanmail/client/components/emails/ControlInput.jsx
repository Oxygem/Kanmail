import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';

import keyboard from 'keyboard.js';

import controlStore from 'stores/control.js';
import folderStore from 'stores/folders.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(folderStore)
class ControlInput extends React.Component {
    static propTypes = {
        inputHandler: PropTypes.func.isRequired,
        selectOptions: PropTypes.array,
        header: PropTypes.object,
    }

    constructor(props) {
        super(props);

        this.keyboardWasEnabled = !keyboard.disabled;

        this.state = {
            inputValue: '',
        };
    }

    handleSelectChange = (value) => {
        this.props.inputHandler(value);
        this.handleClose();
    }

    handleFormSubmit = (ev) => {
        ev.preventDefault();
        this.props.inputHandler(this.state.inputValue);
        this.handleClose();
    }

    handleClose = () => {
        controlStore.close(false);
        if (this.keyboardWasEnabled) {
            setTimeout(keyboard.enable, 0);  // prevent the *current* keyboard event executing
        }
    }

    render () {
        const { header, selectOptions } = this.props;

        let input;

        if (selectOptions) {
            input = <Select
                id="control-input"
                classNamePrefix="react-select"
                options={selectOptions}
                autoFocus={true}
                openMenuOnFocus={true}
                closeMenuOnSelect={false}
                menuIsOpen={true}
                onMenuClose={this.handleClose}
                onChange={this.handleSelectChange}
                onFocus={this.keyboardWasEnabled ? keyboard.disable :null}
                onBlur={this.keyboardWasEnabled ? keyboard.enable : null}
            />;
        } else {
            input = <form onSubmit={this.handleFormSubmit}>
                <input
                    id="control-input"
                    value={this.state.inputValue}
                    onChange={(ev) => this.setState({inputValue: ev.target.value})}
                    ref={(input) => input && input.focus()}
                />
            </form>;
        }

        return (
            <div>
                <section id="control-background">
                    <section id="control">
                        <p>{header}</p>
                        {input}
                    </section>
                </section>
            </div>
        );
    }
}


@subscribe(controlStore)
export default class ControlInputWrapper extends React.Component {
    static propTypes = {
        open: PropTypes.bool.isRequired,
        inputHandler: PropTypes.func.isRequired,
        extraProps: PropTypes.bool.isRequired,
    }

    render() {
        if (!this.props.open) {
            return null;
        }

        return <ControlInput
            inputHandler={this.props.inputHandler}
            {...this.props.extraProps}
        />;
    }
}
