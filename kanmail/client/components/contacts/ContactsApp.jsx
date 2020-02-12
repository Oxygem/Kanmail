import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import HeaderBar from 'components/HeaderBar.jsx';


class Contact extends React.Component {
    static propTypes = {
        email: PropTypes.string.isRequired,
        name: PropTypes.string,
    }

    constructor(props) {
        super(props);

        this.state = {
            editing: false,
            name: props.name,
            email: props.email,
        };
    }

    toggleEdit = () => {
        this.setState({
            editing: !this.state.editing,
            deleteConfirm: false,
        });
    }

    updateState = (key, ev) => {
        this.setState({
            [key]: ev.target.value,
        });
    }

    handleClickDelete = () => {
        if (!this.state.deleteConfirm) {
            this.setState({
                deleteConfirm: true,
            });
            return;
        }
    }

    renderFormOrText() {
        if (!this.state.editing) {
            if (this.props.name) {
                return <div className="text">{this.props.name} ({this.props.email})</div>;
            }

            return <div className="text">{this.props.email}</div>;
        }

        return (
            <div>
                <input
                    type="text"
                    value={this.state.name || ''}
                    onChange={_.partial(this.updateState, 'name')}
                />
                <input
                    type="email"
                    value={this.state.email}
                    onChange={_.partial(this.updateState, 'email')}
                />
            </div>
        );
    }

    renderButtons() {
        if (!this.state.editing) {
            return (
                <div>
                    <button onClick={this.toggleEdit}>Edit</button>&nbsp;
                    <button onClick={this.handleClickDelete} className="cancel">
                        {this.state.deleteConfirm ? 'Are you SURE?' : 'Delete'}
                    </button>
                </div>
            );
        }

        return (
            <div>
                <button className="submit">Update</button>&nbsp;
                <button onClick={this.toggleEdit}>Cancel</button>
            </div>
        );
    }

    render() {
        return (
            <div className="contact">
                {this.renderFormOrText()}
                <div className="buttons">
                    {this.renderButtons()}
                </div>
            </div>
        );
    }
}

export default class ContactsApp extends React.Component {
    static propTypes = {
        contacts: PropTypes.array.isRequired,
    }

    renderContactList() {
        return _.map(this.props.contacts, ([name, email]) => (
            <Contact name={name} email={email} key={`${email}-${name}`} />
        ));
    }

    render() {
        return (
            <div>
                <HeaderBar />

                <section id="contacts">
                    <h2>{_.size(this.props.contacts)} Contacts</h2>

                    <form className="add-contact">
                        <div>
                            <label htmlFor="name">Name</label>
                            <input type="text" id="name" />
                        </div>

                        <div>
                            <label htmlFor="email">Email</label>
                            <input type="email" />
                        </div>

                        <button className="submit">Add contact</button>
                    </form>

                    {this.renderContactList()}
                </section>
            </div>
        );
    }
}
