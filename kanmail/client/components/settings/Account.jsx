import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { ALIAS_FOLDERS, PROVIDERS_DOC_LINK } from 'constants.js';
import { openLink } from 'window.js';

import { post } from 'util/requests.js';


const getInitialState = (props) => {
    const state = {
        editing: props.alwaysEditing || false,
        editingTab: props.alwaysEditing ? 'imap' : 'address',
        deleteConfirm: false,

        error: props.error,
        errorType: props.errorType,

        isSaving: false,

        accountId: props.accountId,

        name: '',
        imapSettings: {},
        smtpSettings: {},
        folderSettings: {},
        contactSettings: [],

        connected: props.connected,
    };

    if (props.accountSettings) {
        state.name = props.accountSettings.name,
        state.imapSettings = _.clone(props.accountSettings.imap_connection);
        state.smtpSettings = _.clone(props.accountSettings.smtp_connection);
        state.folderSettings = _.clone(props.accountSettings.folders) || {};
        state.contactSettings = _.clone(props.accountSettings.contacts) || [];
    }

    return state;
};


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
            <div className="half">
                <label>Name</label>
                <input
                    type="text"
                    value={contactTuple[0]}
                    onChange={this.props.updateName}
                />
                <label>Email</label>
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
        accountSettings: PropTypes.object.isRequired,
        deleteAccount: PropTypes.func.isRequired,
        accountIndex: PropTypes.number,
        updateAccount: PropTypes.func,
        moveUp: PropTypes.func,
        moveDown: PropTypes.func,
        alwaysEditing: PropTypes.bool,
    }

    constructor(props) {
        super(props);
        this.state = getInitialState(props);
    }

    resetState = () => {
        const state = getInitialState(this.props);
        this.setState(state);
    }

    handleClickCancel = (ev) => {
        ev.preventDefault();

        if (this.props.alwaysEditing) {
            this.props.deleteAccount();
        }

        this.resetState();
    }

    handleClickEdit = (ev) => {
        ev.preventDefault();
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

        this.props.deleteAccount(this.props.accountIndex);
        return;
    }

    handleUpdate = (settingsKey, key, ev) => {
        let value = ev.target.value;
        if (value && ev.target.type === 'number') {
            value = parseInt(value);
        }

        const target = this.state[settingsKey];
        target[key] = value;

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

        this.setState({isSaving: true});

        post('/api/settings/account/test', {
            imap_connection: this.state.imapSettings,
            smtp_connection: this.state.smtpSettings,
        }, {ignoreStatus: [400]}).then(() => {
            const filteredContacts = _.filter(
                this.state.contactSettings,
                contactTuple => contactTuple[0].length && contactTuple[1].length,
            );

            this.props.updateAccount(
                this.props.accountIndex,
                {
                    imap_connection: this.state.imapSettings,
                    smtp_connection: this.state.smtpSettings,
                    folders: this.state.folderSettings,
                    contacts: filteredContacts,
                    name: this.state.name,
                },
            );

            this.setState({connected: true});

            if (!this.state.alwaysEditing) {
                this.resetState();
            }
        }).catch(error => {
            this.setState({
                error: error.data.errorMessage,
                errorType: error.data.errorName,
                isSaving: false,
                connected: false,
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
            attributes.checked = value || false;
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
            <div className="half" key={folder}>
                <label htmlFor={`folderSettings-${folder}`}>{_.upperFirst(folder)}</label>
                {this.renderInput('folderSettings', folder)}
            </div>
        ));
    }

    renderAddresses() {
        if (!this.state.contactSettings.length) {
            return 'No addresses!';
        }

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

    renderViewButtons() {
        if (this.state.deleteConfirm) {
            return (
                <div className="right">
                    <button onClick={this.handleClickCancel}>Cancel</button>
                    &nbsp;
                    <button
                        className="cancel"
                        onClick={this.handleClickDelete}
                    >Are you SURE?</button>
                </div>
            );
        }

        if (!this.state.editing) {
            return (
                <div className="right">
                    <button onClick={this.props.moveUp} className="inactive">
                        <i className="fa fa-arrow-up"></i>
                    </button>
                    &nbsp;
                    <button onClick={this.props.moveDown} className="inactive">
                        <i className="fa fa-arrow-down"></i>
                    </button>
                    &nbsp;
                    <button onClick={this.handleClickEdit}>
                        Edit
                    </button>
                    &nbsp;
                    <button onClick={this.handleClickDelete} className="cancel">
                        {this.state.deleteConfirm ? 'Are you SURE?' : 'Delete'}
                    </button>
                </div>
            );
        }
    }

    renderConnectedText() {
        if (this.state.connected) {
            return <small className="connected">connected</small>;
        } else {
            return <small className="not-connected">no connection</small>;
        }
    }

    render() {
        if (!this.state.editing) {
            return (
                <div className="account">
                    <div className="wide">
                        {this.renderViewButtons()}
                        <strong>{this.state.name}</strong>
                        &nbsp;
                        {this.renderConnectedText()}
                        <br />
                        {this.state.imapSettings.username}
                    </div>
                </div>
            );
        }

        const formClasses = ['account'];
        if (this.state.editing) formClasses.push('active');
        if (this.props.alwaysEditing) formClasses.push('new');

        const getTabButtonClass = tabName => (
            this.state.editingTab == tabName ? 'submit' : 'inactive'
        );

        const setTab = (tabName, ev) => {
            ev.preventDefault();
            this.setState({editingTab: tabName});
        };

        const saveButtonClasses = ['submit'];
        if (this.state.isSaving) {
            saveButtonClasses.push('disabled');
        }

        return (
            <form className={formClasses.join(' ')}>
                <div className="wide top-bar">
                    <div className="right">
                        <button
                            type="submit"
                            className={saveButtonClasses.join(' ')}
                            onClick={this.handleTestConnection}
                        >{this.props.alwaysEditing ? 'Add account' : 'Update account'}</button>
                        &nbsp;
                        <button
                            type="submit"
                            onClick={this.props.alwaysEditing ? this.props.deleteAccount : this.handleClickCancel}
                        >Cancel</button>
                    </div>
                    <input
                        className="inline"
                        type="text"
                        value={this.state.name}
                        placeholder="Account name"
                        onChange={(ev) => this.setState({name: ev.target.value})}
                    />
                    &nbsp;
                    {this.renderConnectedText()}

                    <div className="error">{this.state.error}</div>

                    <div className="wide">
                        {this.props.alwaysEditing || <button
                            className={getTabButtonClass('address')}
                            onClick={_.partial(setTab, 'address')}
                        >Addresses</button>}
                        &nbsp;
                        {this.props.alwaysEditing || <button
                            className={getTabButtonClass('mailbox')}
                            onClick={_.partial(setTab, 'mailbox')}
                        >Mailboxes</button>}
                        &nbsp;
                        <button
                            className={getTabButtonClass('imap')}
                            onClick={_.partial(setTab, 'imap')}
                        >Incoming server</button>
                        &nbsp;
                        <button
                            className={getTabButtonClass('smtp')}
                            onClick={_.partial(setTab, 'smtp')}
                        >Outgoing server</button>
                    </div>
                </div>

                <div className={this.state.editingTab == 'address' ? 'wide' : 'hidden'}>
                    <div className="flex wide">{this.renderAddresses()}</div>
                    <button className="submit" onClick={this.handleAddAddress}>
                        Add address
                    </button>
                </div>

                <div className={this.state.editingTab == 'mailbox' ? 'wide' : 'hidden'}>
                    <div className="flex wide">{this.renderFolderSettings()}</div>
                    <div className="flex wide">
                        <div className="half">
                            <label
                                className="checkbox"
                                htmlFor="folderSettings-save_sent_copies"
                            >Save copies of sent mail in the sent folder?</label>
                            {this.renderInput('folderSettings', 'save_sent_copies', {
                                'type': 'checkbox'
                            })}
                        </div>
                        <div className="half">
                            <label
                                className="checkbox"
                                htmlFor="folderSettings-copy_on_move"
                            >
                                <span className="red">Advanced</span>&nbsp; (<a onClick={(ev) => {
                                    ev.preventDefault();
                                    openLink(`${PROVIDERS_DOC_LINK}#advanced-settings`);
                                }}>more info</a>):
                                <br />Copy (not move) emails out of the inbox?
                            </label>
                            {this.renderInput('folderSettings', 'copy_on_move', {
                                'type': 'checkbox'
                            })}
                        </div>
                    </div>
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
                            {this.renderInput('imapSettings', 'port', {
                                'type': 'number',
                            })}
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
                        <div className="quarter">
                            <label
                                className="checkbox"
                                htmlFor="imapSettings-ssl"
                            >SSL?</label>
                            {this.renderInput('imapSettings', 'ssl', {
                                type: 'checkbox',
                            })}
                        </div>
                        <div className="half">
                            <label
                                className="checkbox"
                                htmlFor="imapSettings-ssl_verify_hostname"
                            >
                                <span className="red">Advanced</span>&nbsp; (<a onClick={(ev) => {
                                    ev.preventDefault();
                                    openLink(`${PROVIDERS_DOC_LINK}#advanced-settings`);
                                }}>more info</a>):
                                <br />Verify SSL hostname?
                            </label>
                            {this.renderInput('imapSettings', 'ssl_verify_hostname', {
                                type: 'checkbox',
                            })}
                        </div>
                        <div className="quarter"></div>
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
                            {this.renderInput('smtpSettings', 'port', {
                                type: 'number',
                            })}
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
                        <div className="quarter">
                            <label
                                className="checkbox"
                                htmlFor="smtpSettings-tls"
                            >Use TLS?</label>
                            {this.renderInput('smtpSettings', 'tls', {
                                type: 'checkbox',
                            })}
                        </div>
                        <div className="quarter">
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
                                htmlFor="smtpSettings-ssl_verify_hostname"
                            >
                                <span className="red">Advanced</span> (<a onClick={(ev) => {
                                    ev.preventDefault();
                                    openLink(`${PROVIDERS_DOC_LINK}#advanced-settings`);
                                }}>more info</a>):
                                <br />Verify SSL hostname?</label>
                            {this.renderInput('smtpSettings', 'ssl_verify_hostname', {
                                type: 'checkbox',
                            })}
                        </div>
                    </div>
                </div>
            </form>
        );
    }
}
