import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { post } from 'util/requests.js';


const getDefaultState = () => ({
    name: '',
    email: '',
});


export default class AddNewContactForm extends React.Component {
    static propTypes = {
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

        post('/api/contacts', this.state)
            .then(data => {
                this.props.addNewContact(
                    data.id,
                    this.state.name,
                    this.state.email,
                );
                this.setState(getDefaultState());
            })
            .catch(err => console.error('ADD CONTACT ERROR', err));
    }

    render() {
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

                <button
                    className="submit"
                    onClick={this.handleClickSubmit}
                >Add contact</button>
            </form>
        );
    }
}
