import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { post } from 'util/requests.js';


const getDefaultState = () => ({
    name: '',
    email: '',
    saveError: null,
});


export default class AddNewContactForm extends React.Component {
    static propTypes = {
        isOpen: PropTypes.bool.isRequired,
        toggleForm: PropTypes.func.isRequired,
        addNewContact: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = getDefaultState();
    }

    updateState = (key, ev) => {
        this.setState({
            [key]: ev.target.value,
        });
    }

    handleClickSubmit = (ev) => {
        ev.preventDefault();

        if (this.state.saveError) {
            this.setState({saveError: null});
            return;
        }

        post('/api/contacts', this.state, {ignoreStatus: [400]})
            .then(data => {
                this.props.addNewContact(
                    data.id,
                    this.state.name,
                    this.state.email,
                );
                this.setState(getDefaultState());
                this.props.toggleForm();
            })
            .catch(err => this.setState({saveError: err}));
    }

    handleClickCancel = () => {
        this.props.toggleForm();
        this.setState(getDefaultState());
    }

    renderSaveButton() {
        if (this.state.saveError) {
            return <button
                className="error"
                onClick={this.handleClickSubmit}
            >Error: {this.state.saveError.data.errorMessage}</button>;
        }

        return <button
            className="submit"
            onClick={this.handleClickSubmit}
        >Add contact</button>;
    }

    render() {
        if (!this.props.isOpen) {
            return <button
                className="submit"
                onClick={this.props.toggleForm}
            >Add new contact</button>;
        }

        return (
            <form className="add-contact">
                <div>
                    <label htmlFor="name">New contact name</label>
                    <input
                        type="text"
                        id="name"
                        value={this.state.name || ''}
                        onChange={_.partial(this.updateState, 'name')}
                    />
                </div>

                <div>
                    <label htmlFor="email">New contact email</label>
                    <input
                        type="email"
                        id="email"
                        value={this.state.email || ''}
                        onChange={_.partial(this.updateState, 'email')}
                    />
                </div>

                {this.renderSaveButton()}&nbsp;
                <button
                    onClick={this.handleClickCancel}
                >Cancel</button>
            </form>
        );
    }
}
