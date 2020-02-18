import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { ALIAS_FOLDERS } from 'constants.js';

import { post } from 'util/requests.js';


const getInitialState = (props) => {
    return {
        editing: props.alwaysEditing || false,
        editingTab: 'address',
        deleteConfirm: false,

        error: props.error,
        errorType: props.errorType,

        accountId: props.accountId,
        imapSettings: _.clone(props.accountSettings.imap_connection) || {},
        smtpSettings: _.clone(props.accountSettings.smtp_connection) || {},
        folderSettings: _.clone(props.accountSettings.folders) || {},
        contactSettings: _.clone(props.accountSettings.contacts) || [],
    };
}


class AccountAddress extends React.Component {
    static propTypes = {
        updateName: PropTypes.func.isRequired,
        updateEmail: PropTypes.func.isRequired,
        deleteAddress: PropTypes.func.isRequired,
        contactTuple: PropTypes.array.isRequired,
    }

    render() {
        const { contactTuple } = this.props;

        return (
            <div>
                <label>name</label>
                <input
                    type="text"
                    value={contactTuple[0]}
                    onChange={this.props.updateName}
                />
                <label>email</label>
                <input
                    type="text"
                    value={contactTuple[1]}
                    onChange={this.props.updateEmail}
                />
                <button
                    type="submit"
                    className="cancel"
                    onClick={this.props.deleteAddress}
                ><i className="fa fa-times"></i></button>
            </div>
        );
    }
}


export default class Account extends React.Component {
    static propTypes = {
        accountId: PropTypes.string,
        accountSettings: PropTypes.object.isRequired,
        deleteAccount: PropTypes.func.isRequired,
        updateAccount: PropTypes.func.isRequired,
        alwaysEditing: PropTypes.bool,
    }

    constructor(props) {
        super(props);
        this.state = getInitialState(props);
    }

    resetState() {
        const state = getInitialState(this.props);
        this.setState(state);
    }

    toggleSettings = (ev) => {
        ev.preventDefault();

        if (this.state.editing) {
            this.resetState();
            return;
        }

        this.setState({
            editing: true,
        });
    }

    handleClickDelete = (ev) => {
        ev.preventDefault();

        if (!this.state.deleteConfirm) {
            this.setState({
                deleteConfirm: true,
            });
            return;
        }

        this.props.deleteAccount(this.props.accountId);
        return;
    }

    handleUpdate = (settingsKey, key, ev) => {
        const target = this.state[settingsKey];
        target[key] = ev.target.value;

        this.setState({
            [settingsKey]: target,
        });
    }

    handleCheckboxUpdate = (settingsKey, key, ev) => {
        const target = this.state[settingsKey];
        target[key] = ev.target.checked;

        this.setState({
            [settingsKey]: target,
        });
    }

    handleTestConnection = (ev) => {
        ev.preventDefault();

        post('/api/settings/account/test', {
            imap_connection: this.state.imapSettings,
            smtp_connection: this.state.smtpSettings,
        }).then(() => {
            const filteredContacts = _.filter(
                this.state.contactSettings,
                contactTuple => contactTuple[0].length && contactTuple[1].length,
            );

            this.props.updateAccount(
                this.props.accountId,
                {
                    imap_connection: this.state.imapSettings,
                    smtp_connection: this.state.smtpSettings,
                    folders: this.state.folderSettings,
                    contacts: filteredContacts,
                },
                this.state.accountId,  // handles renaming
            );
            if (!this.state.alwaysEditing) {
                this.resetState();
            }
        }).catch(error => {
            this.setState({
                error: error.data.error_message,
                errorType: error.data.error_type,
            });
        });
    }

    handleAddAddress = (ev) => {
        ev.preventDefault();

        const { contactSettings } = this.state;
        contactSettings.push(['', '']);
        this.setState({
            contactSettings,
        });
    }

    renderInput(settingsKey, key, options={}) {
        const type = options.type || 'text';
        const placeholder = options.placeholder || null;

        let value = '';
        value = this.state[settingsKey][key];

        const attributes = {};
        let handler = _.partial(this.handleUpdate, settingsKey, key);

        if (type === 'checkbox') {
            attributes.checked = value;
            handler = _.partial(this.handleCheckboxUpdate, settingsKey, key);
        }

        return (
            <input
                type={type}
                id={`${settingsKey}-${key}`}
                value={value}
                placeholder={placeholder}
                onChange={handler}
                {...attributes}
            />
        );
    }

    renderFolderSettings() {
        return _.map(ALIAS_FOLDERS, folder => (
            <div key={folder}>
                <label htmlFor={`folderSettings-${folder}`}>{folder}</label>
                {this.renderInput('folderSettings', folder)}
            </div>
        ));
    }

    renderAddresses() {
        return _.map(this.state.contactSettings, (contactTuple, i) => {
            const updateName = (ev) => {
                const { contactSettings } = this.state;
                contactSettings[i][0] = ev.target.value;
                this.setState({
                    contactSettings,
                });
            }

            const updateEmail = (ev) => {
                const { contactSettings } = this.state;
                contactSettings[i][1] = ev.target.value;
                this.setState({
                    contactSettings,
                });
            }

            const deleteAddress = (ev) => {
                ev.preventDefault();

                const { contactSettings } = this.state;
                contactSettings.splice(i, 1);
                this.setState({
                    contactSettings,
                });
            }

            return (
                <AccountAddress
                    contactTuple={contactTuple}
                    updateName={updateName}
                    updateEmail={updateEmail}
                    deleteAddress={deleteAddress}
                    key={i}
                />
            );
        });
    }

    render() {
        if (!this.state.editing) {
            return (
                <div className="account">
                    <div className="wide">
                        <div className="right">
                            <button onClick={this.toggleSettings}>
                                <i className="fa fa-cog"></i>
                            </button>
                            <button onClick={this.handleClickDelete} className="cancel">
                                {this.state.deleteConfirm ? 'Are you SURE?' : 'Delete'}
                            </button>
                        </div>

                        <strong>{this.state.accountId}</strong><br />
                        {this.state.imapSettings.username}
                    </div>
                </div>
            );
        }

        const classes = ['account'];
        if (this.state.editing) classes.push('active');
        if (this.props.alwaysEditing) classes.push('new');

        const getTabButtonClass = tabName => (
            this.state.editingTab == tabName ? 'submit' : 'inactive'
        );

        const setTab = (tabName, ev) => {
            ev.preventDefault();
            this.setState({editingTab: tabName});
        };

        return (
            <form className={classes.join(' ')}>
                <div className="wide top-bar">
                    <div className="right">
                        <button
                            type="submit"
                            className="submit"
                            onClick={this.handleTestConnection}
                        >{this.props.alwaysEditing ? 'Create & Add Account' : 'Update Account'}</button>
                        <button
                            type="submit"
                            className="cancel"
                            onClick={this.props.alwaysEditing ? this.props.deleteAccount : this.toggleSettings}
                        ><i className="fa fa-times"></i></button>
                    </div>
                    <input
                        className="inline"
                        type="text"
                        value={this.state.accountId}
                        onChange={(ev) => this.setState({accountId: ev.target.value})}
                    />
                    <div className="error">{!this.state.errorType && this.state.error}</div>

                    <div className="wide">
                        <button
                            className={getTabButtonClass('address')}
                            onClick={_.partial(setTab, 'address')}
                        >Addresses</button>
                        <button
                            className={getTabButtonClass('mailbox')}
                            onClick={_.partial(setTab, 'mailbox')}
                        >Mailboxes</button>
                        <button
                            className={getTabButtonClass('imap')}
                            onClick={_.partial(setTab, 'imap')}
                        >Incoming server</button>
                        <button
                            className={getTabButtonClass('smtp')}
                            onClick={_.partial(setTab, 'smtp')}
                        >Outgoing server</button>
                    </div>
                </div>

                <div className={this.state.editingTab == 'address' ? 'wide' : 'hidden'}>
                    <div className="flex wide">{this.renderAddresses()}</div>
                    <button className="submit" onClick={this.handleAddAddress}>
                        Add Address
                    </button>
                </div>

                <div className={this.state.editingTab == 'mailbox' ? 'wide' : 'hidden'}>
                    <div className="flex wide">{this.renderFolderSettings()}</div>
                </div>

                <div className={this.state.editingTab == 'imap' ? 'wide' : 'hidden'}>
                    <div className="error">{this.state.errorType === 'imap' && this.state.error}</div>
                    <div className="flex wide">
                        <div className="half">
                            <label htmlFor="imapSettings-host">Hostname</label>
                            {this.renderInput('imapSettings', 'host')}
                        </div>
                        <div className="half">
                            <label htmlFor="imapSettings-port">Port</label>
                            {this.renderInput('imapSettings', 'port')}
                        </div>
                        <div className="half">
                            <label htmlFor="imapSettings-username">Username</label>
                            {this.renderInput('imapSettings', 'username')}
                        </div>
                        <div className="half">
                            <label htmlFor="imapSettings-password">Password</label>
                            {this.renderInput('imapSettings', 'password', {
                                type: 'password',
                                placeholder: 'enter to change'
                            })}
                        </div>
                        <div className="half">
                            <label
                                className="checkbox"
                                htmlFor="imapSettings-ssl"
                            >SSL?</label>
                            {this.renderInput('imapSettings', 'ssl', {
                                type: 'checkbox',
                            })}
                        </div>
                    </div>
                </div>

                <div className={this.state.editingTab == 'smtp' ? 'wide' : 'hidden'}>
                    <div className="error">{this.state.errorType === 'smtp' && this.state.error}</div>
                    <div className="flex wide">
                        <div className="half">
                            <label htmlFor="smtpSettings-host">Hostname</label>
                            {this.renderInput('smtpSettings', 'host')}
                        </div>
                        <div className="half">
                            <label htmlFor="smtpSettings-port">Port</label>
                            {this.renderInput('smtpSettings', 'port')}
                        </div>
                        <div className="half">
                            <label htmlFor="smtpSettings-username">Username</label>
                            {this.renderInput('smtpSettings', 'username')}
                        </div>
                        <div className="half">
                            <label htmlFor="smtpSettings-password">Password</label>
                            {this.renderInput('smtpSettings', 'password', {
                                type: 'password',
                                placeholder: 'enter to change',
                            })}
                        </div>
                        <div className="half">
                            <label
                                className="checkbox"
                                htmlFor="smtpSettings-ssl"
                            >Use SSL?</label>
                            {this.renderInput('smtpSettings', 'ssl', {
                                type: 'checkbox',
                            })}
                        </div>
                        <div className="half">
                            <label
                                className="checkbox"
                                htmlFor="smtpSettings-tls"
                            >Use TLS?</label>
                            {this.renderInput('smtpSettings', 'tls', {
                                type: 'checkbox',
                            })}
                        </div>
                    </div>
                </div>
            </form>
        );
    }
}
