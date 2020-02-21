import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import HeaderBar from 'components/HeaderBar.jsx';
import Contact from 'components/contacts/Contact.jsx';
import AddNewContactForm from 'components/contacts/AddNewContactForm.jsx';


export default class ContactsApp extends React.Component {
    static propTypes = {
        contacts: PropTypes.array.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            contacts: props.contacts,
            contactsFilter: '',
        };
    }

    addNewContact = (id, name, email) => {
        const contacts = this.state.contacts;
        contacts.unshift([id, name, email]);
        this.setState({contacts});
    }

    deleteContact = (idToDelete) => {
        const contacts = _.filter(this.state.contacts, ([id]) => id !== idToDelete);
        this.setState({contacts});
    }

    handleFilter = (ev) => {
        this.setState({
            contactsFilter: ev.target.value,
        });
    }

    renderContactList = () => {
        let contacts = this.state.contacts;

        if (this.state.contactsFilter) {
            const filterText = this.state.contactsFilter.toLowerCase();

            contacts = _.filter(contacts, ([, name, email]) => (
                (name && name.toLowerCase().indexOf(filterText) >= 0) ||
                email.toLowerCase().indexOf(filterText) >= 0
            ));
        }

        return _.map(contacts, ([id, name, email]) => (
            <Contact
                id={id} key={id}
                name={name} email={email}
                deleteContact={this.deleteContact}
            />
        ));
    }

    render() {
        return (
            <div>
                <HeaderBar />

                <section id="contacts">
                    <h2>{_.size(this.state.contacts)} Contacts</h2>
                    <div className="search">
                        <label htmlFor="search">Filter contacts</label>
                        <input
                            type="text"
                            id="search"
                            value={this.state.contactsFilter}
                            onChange={this.handleFilter}
                        />
                    </div>
                    <AddNewContactForm addNewContact={this.addNewContact} />
                    <div id="contact-list">{this.renderContactList()}</div>
                </section>
            </div>
        );
    }
}
