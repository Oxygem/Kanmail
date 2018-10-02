import React from 'react';
import PropTypes from 'prop-types';

import keyboard from 'keyboard.js';
import folderStore from 'stores/folders.js';
import settingsStore from 'stores/settings.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(folderStore, settingsStore)
export default class AddNewColumnForm extends React.Component {
    static propTypes = {
        folders: PropTypes.array.isRequired,
        settingsStore: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            addingColumn: false,
        };
    }

    handleShowInputClick = () => {
        this.setState({
            addingColumn: true,
        });
    }

    handleHideInputClick = () => {
        this.setState({
            addingColumn: false,
            addColumnInput: null,
        });
    }

    handleInputChange = (ev) => {
        this.setState({
            addColumnInput: ev.target.value,
        });
    }

    handleFormSubmit = (ev) => {
        ev.preventDefault();

        this.props.settingsStore.addColumn(this.state.addColumnInput);

        // Reset the input
        this.setState({
            addColumnInput: '',
        });
    }

    renderForm() {
        if (!this.state.addingColumn) {
            return <a onClick={this.handleShowInputClick}>
                <i className="fa fa-plus-square-o"></i>
            </a>;
        }

        return (
            <div>
                <input
                    type="text"
                    onChange={this.handleInputChange}
                    onFocus={keyboard.disable}
                    onBlur={keyboard.enable}
                    value={this.state.addColumnInput || ''}
                />
                <a onClick={this.handleHideInputClick}>X</a>
            </div>
        );
    }

    render() {
        return (
            <form id="add-column" onSubmit={this.handleFormSubmit}>
                {this.renderForm()}
            </form>
        );
    }
}
