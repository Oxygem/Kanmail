import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { ALIAS_FOLDERS } from 'constants.js';

import { post } from 'util/requests.js';


const getInitialState = (props) => {
    return {
        editing: props.alwaysEditing || false,
        deleteConfirm: false,

        error: props.error,
        errorType: props.errorType,

        imapSettings: _.clone(props.accountSettings.imap_connection) || {},
        smtpSettings: _.clone(props.accountSettings.smtp_connection) || {},
        folderSettings: _.clone(props.accountSettings.folders) || {},
    };
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

        post('/api/settings/account', {
            name: this.props.accountId,
            imap_connection: this.state.imapSettings,
            smtp_connection: this.state.smtpSettings,
        }).then(() => {
            this.props.updateAccount(
                this.props.accountId,
                {
                    imap_connection: this.state.imapSettings,
                    smtp_connection: this.state.smtpSettings,
                    folders: this.state.folderSettings,
                },
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

    renderInput(settingsKey, key, options={}) {
        const type = options.type || 'text';
        const placeholder = options.placeholder || null;

        let value = '';
        if (type !== 'password') {
            value = this.state[settingsKey][key];
        }

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
            <div>
                <label htmlFor={`folderSettings-${folder}`}>{folder}</label>
                {this.renderInput('folderSettings', folder)}
            </div>
        ));
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

                        <strong>{this.props.accountId}</strong><br />
                        {this.state.imapSettings.username}
                    </div>
                </div>
            );
        }

        const classes = ['account'];
        if (this.state.editing) classes.push('active');
        if (this.props.alwaysEditing) classes.push('new');

        return (
            <form className={classes.join(' ')}>
                <div className="wide">
                    <strong>{this.props.accountId}</strong>
                    <div className="error">{!this.state.errorType && this.state.error}</div>
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
                </div>

                <div className="third">
                    <h3>IMAP Settings</h3>
                    <div className="error">{this.state.errorType === 'imap' && this.state.error}</div>
                    <label htmlFor="imapSettings-host">host</label>
                    {this.renderInput('imapSettings', 'host')}
                    <label htmlFor="imapSettings-port">port</label>
                    {this.renderInput('imapSettings', 'port')}
                    <label htmlFor="imapSettings-username">username</label>
                    {this.renderInput('imapSettings', 'username')}
                    <label htmlFor="imapSettings-password">password</label>
                    {this.renderInput('imapSettings', 'password', {
                        type: 'password',
                        placeholder: 'enter to change'
                    })}
                    <label htmlFor="imapSettings-ssl">ssl?</label>
                    {this.renderInput('imapSettings', 'ssl', {
                        type: 'checkbox',
                    })}
                </div>

                <div className="third">
                    <h3>SMTP Settings</h3>
                    <div className="error">{this.state.errorType === 'smtp' && this.state.error}</div>
                    <label htmlFor="smtpSettings-host">host</label>
                    {this.renderInput('smtpSettings', 'host')}
                    <label htmlFor="smtpSettings-port">port</label>
                    {this.renderInput('smtpSettings', 'port')}
                    <label htmlFor="smtpSettings-username">username</label>
                    {this.renderInput('smtpSettings', 'username')}
                    <label htmlFor="smtpSettings-password">password</label>
                    {this.renderInput('smtpSettings', 'password', {
                        type: 'password',
                        placeholder: 'enter to change',
                    })}
                    <label htmlFor="smtpSettings-ssl">ssl?</label>
                    {this.renderInput('smtpSettings', 'ssl', {
                        type: 'checkbox',
                    })}
                </div>

                <div className="third">
                    <h3>Folder Settings</h3>
                    {this.renderFolderSettings()}
                </div>
            </form>
        );
    }
}
