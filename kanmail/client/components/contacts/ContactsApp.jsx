import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import Contact from 'components/contacts/Contact.jsx';
import AddNewContactForm from 'components/contacts/AddNewContactForm.jsx';
import { makeDragElement, makeNoDragElement } from 'window.js';


export default class ContactsApp extends React.Component {
    static propTypes = {
        contacts: PropTypes.array.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            newContactFormOpen: false,
            contacts: props.contacts,
            contactsFilter: '',
        };
    }

    addNewContact = (id, name, email) => {
        const contacts = this.state.contacts;
        contacts.unshift({id, name, email});
        this.setState({contacts});
    }

    deleteContact = (idToDelete) => {
        const contacts = _.filter(
            this.state.contacts,
            ({id}) => id !== idToDelete,
        );
        this.setState({contacts});
    }

    handleFilter = (ev) => {
        this.setState({
            contactsFilter: ev.target.value,
        });
    }

    toggleForm = () => {
        this.setState({newContactFormOpen: !this.state.newContactFormOpen});
    }

    renderContactList = () => {
        let contacts = this.state.contacts;

        if (this.state.contactsFilter) {
            const filterText = this.state.contactsFilter.toLowerCase();

            contacts = _.filter(contacts, ({name, email}) => (
                (name && name.toLowerCase().indexOf(filterText) >= 0) ||
                email.toLowerCase().indexOf(filterText) >= 0
            ));
        }

        return _.map(contacts, ({id, name, email}) => (
            <Contact
                id={id} key={id}
                name={name} email={email}
                deleteContact={this.deleteContact}
            />
        ));
    }

    render() {
        return (
            <section className="no-select">
                <header className="contacts flex header-bar" ref={makeDragElement}>
                    <h2>{_.size(this.state.contacts).toLocaleString()} Contacts</h2>
                    <div className="search">
                        <input
                            type="text"
                            value={this.state.contactsFilter}
                            onChange={this.handleFilter}
                            placeholder="Filter contacts..."
                            ref={makeNoDragElement}
                        />
                    </div>
                    <div>
                        <button onClick={this.toggleForm} ref={makeNoDragElement}>
                            <i className="fa fa-user-plus"></i> Add Contact
                        </button>
                    </div>
                </header>

                <section id="contacts">
                    <AddNewContactForm
                        addNewContact={this.addNewContact}
                        toggleForm={this.toggleForm}
                        isOpen={this.state.newContactFormOpen}
                    />
                    <div
                        id="contact-list"
                        className={this.state.newContactFormOpen && 'form-open' || ''}
                    >{this.renderContactList()}</div>
                </section>
            </section>
        );
    }
}
