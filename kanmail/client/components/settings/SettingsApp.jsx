import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import HeaderBar from 'components/HeaderBar.jsx';
import Account from 'components/settings/Account.jsx';

import keyboard from 'keyboard.js';
import { closeWindow } from 'window.js';

import { delete_, get, post } from 'util/requests.js';


const newAccountState = {
    showAdvancedSettings: false,

    // Add account phase 1 - name/username/password autoconfig form
    addingAccount: false,
    newAccountName: '',
    newAccountUsername: '',
    newAccountPassword: '',
    newAccountError: null,

    // Add account phase 2 - manual config if auto fails
    isLoadingNewAccount: false,
    configuringNewAccount: false,
    newAccountSettings: null,
}


export default class SettingsApp extends React.Component {
    static propTypes = {
        settings: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);

        keyboard.disable();

        this.state = {
            accounts: props.settings.accounts,
            systemSettings: props.settings.system || {},
            styleSettings: props.settings.style || {},
            ...newAccountState,
        };
    }

    resetState = () => {
        this.setState(newAccountState);
    }

    deleteAccount = (accountId) => {
        this.setState({
            accounts: _.omit(this.state.accounts, accountId),
        });
    }

    updateAccount = (accountId, newSettings) => {
        if (!this.state.accounts[accountId]) {
            throw Error('nope');
        }

        const newAccounts = this.state.accounts;
        newAccounts[accountId] = newSettings;

        this.setState({
            accounts: newAccounts,
        });
    }

    completeAddNewAccount = (accountId, newSettings) => {
        const newAccounts = this.state.accounts;
        newAccounts[accountId] = newSettings;

        this.setState({
            accounts: newAccounts,
            ...newAccountState,
        });

        this.reset();
    }

    toggleAddAccount = () => {
        this.setState({
            addingAccount: !this.state.addingAccount,
        });
    }

    handleAddAccount = (ev) => {
        ev.preventDefault();

        if (
            !this.state.newAccountName ||
            !this.state.newAccountUsername ||
            !this.state.newAccountPassword
        ) {
            this.setState({
                newAccountError: 'Missing name, email or password!',
            });
            return;
        }

        if (this.state.accounts[this.state.newAccountName]) {
            this.setState({
                newAccountError: `There is already an account called ${this.state.newAccountName}`,
            });
            return;
        }

        const data = {
            username: this.state.newAccountUsername,
            password: this.state.newAccountPassword,
        };

        const handleSettings = (data) => {
            if (data.connected) {
                this.completeAddNewAccount(
                    this.state.newAccountName,
                    data.settings,
                );
                return;
            }

            this.setState({
                isLoadingNewAccount: false,
                configuringNewAccount: true,
                newAccountSettings: data.settings,
                newAccountError: data.error_message,
                newAccountErrorType: data.error_type,
            });
        }

        this.setState({isLoadingNewAccount: true});

        // Post to new endpoint - hopefully it will autoconfigure and connect itself
        post('/api/settings/account/new', data)
            .then(handleSettings)
            .catch(err => handleSettings(err.data),
        );
    }

    handleUpdate = (stateKey, ev) => {
        this.setState({
            [stateKey]: ev.target.value,
        });
    }

    handleSettingUpdate = (stateKey, key, ev) => {
        let value = ev.target.value;
        if (value && ev.target.type === 'number') value = parseInt(value);

        const settings = this.state[stateKey];
        settings[key] = value;

        this.setState({
            [stateKey]: settings,
        });
    }

    handleSaveSettings = (ev) => {
        ev.preventDefault();

        const newSettings = {
            accounts: this.state.accounts,
            system: this.state.systemSettings,
            style: this.state.styleSettings,
            columns: this.props.settings.columns,
        };

        post('/api/settings', newSettings)
            .then(() => closeWindow())
            .catch(err => console.log('SETTING ERROR', err));
    }

    handleBustCache = (ev) => {
        ev.preventDefault();

        delete_('/api/settings/cache')
            .then(() => closeWindow())
            .catch(err => console.log('SETTING ERROR', err));
    }

    renderAccounts() {
        return _.map(this.state.accounts, (accountSettings, accountId) => (
            <Account
                key={accountId}
                accountId={accountId}
                accountSettings={accountSettings}
                deleteAccount={this.deleteAccount}
                updateAccount={this.updateAccount}
            />
        ));
    }

    renderNewAccountForm() {
        if (!this.state.addingAccount) {
            return <button className="submit" onClick={this.toggleAddAccount}>
                Add new account
            </button>;
        }

        if (this.state.configuringNewAccount) {
            return <Account
                key={this.state.newAccountName}
                alwaysEditing={true}
                accountId={this.state.newAccountName}
                accountSettings={this.state.newAccountSettings}
                error={this.state.newAccountError}
                errorType={this.state.newAccountErrorType}
                deleteAccount={this.resetState}
                updateAccount={this.completeAddNewAccount}
            />
        }

        // <button>Add Gmail Account</button>
        // <button>Add Outlook Account</button>

        return <div className="new-account">
            <form>
                <h3>New Account</h3>
                <div className="error">{this.state.newAccountError}</div>
                <div>
                    <label htmlFor="name">Account Name</label>
                    <input
                        id="name"
                        value={this.state.newAccountName}
                        onChange={_.partial(this.handleUpdate, 'newAccountName')}
                    />
                </div>
                <div>
                    <label htmlFor="username">Email</label>
                    <input
                        id="username"
                        value={this.state.newAccountUsername}
                        onChange={_.partial(this.handleUpdate, 'newAccountUsername')}
                    />
                </div>

                <div>
                    <label htmlFor="password">Password</label>
                    <input
                        id="password"
                        type="password"
                        value={this.state.newAccountPassword}
                        onChange={_.partial(this.handleUpdate, 'newAccountPassword')}
                    />
                </div>

                <button
                    type="submit"
                    className={`submit ${this.state.isLoadingNewAccount && 'disabled'}`}
                    onClick={this.handleAddAccount}
                >Add Account</button>

                <button className="cancel" onClick={this.toggleAddAccount}>
                    <i className="fa fa-times" />
                </button>
            </form>
            <p><strong>Gmail users:</strong> you will need to <a onClick={() => get('/open-link', {url: 'https://myaccount.google.com/apppasswords'})}>create an app password</a> to use with Kanmail.</p>
        </div>;
    }

    renderAdvancedSettings() {
        if (!this.state.showAdvancedSettings) {
            return (
                <div className="settings" id="system">
                    <button
                        onClick={() => this.setState({showAdvancedSettings: true})}
                    >Show advanced settings <i className="fa fa-arrow-down" /></button>
                </div>
            );
        }

        return (
             <div className="settings advanced" id="system">
                 <button
                    onClick={() => this.setState({showAdvancedSettings: false})}
                >Hide advanced settings <i className="fa fa-arrow-down" /></button>

                <h2>
                    Advanced <small>
                        <i className="red fa fa-exclamation-triangle" /> danger zone
                    </small>
                </h2>
                <label htmlFor="batch_size">
                    Batch size
                    <small>number of emails to fetch at once</small>
                </label>
                <input
                    required
                    type="number"
                    id="batch_size"
                    value={this.state.systemSettings.batch_size}
                    onChange={_.partial(
                        this.handleSettingUpdate,
                        'systemSettings', 'batch_size',
                    )}
                />

                <label htmlFor="initial_batches">
                    Initial batches
                    <small>initial number of batches to fetch</small>
                </label>
                <input
                    required
                    type="number"
                    id="initial_batches"
                    value={this.state.systemSettings.initial_batches}
                    onChange={_.partial(
                        this.handleSettingUpdate,
                        'systemSettings', 'initial_batches',
                    )}
                />

                <label htmlFor="sync_days">
                    Sync days
                    <small>
                        days of email to sync (0 = all)<br />
                        note: this does not affect search
                    </small>
                </label>
                <input
                    required
                    type="number"
                    id="sync_days"
                    value={this.state.systemSettings.sync_days}
                    onChange={_.partial(
                        this.handleSettingUpdate,
                        'systemSettings', 'sync_days',
                    )}
                />

                <label>
                    Clear cache
                    <small>
                        any settings changes will be lost,<br />
                        will immediately reload the app
                    </small>
                </label>
                <button
                    className="cancel"
                    onClick={this.handleBustCache}
                >Clear the cache</button>
            </div>
        );
    }

    render() {
        return (
            <div>
                <HeaderBar />

                <section id="settings">
                    <div id="accounts">
                        <h2>Accounts</h2>
                        <small>changes will not be saved until you save all settings at the bottom of the page</small>
                        {this.renderAccounts()}
                        <div id="add-account">
                            {this.renderNewAccountForm()}
                        </div>
                    </div>

                    <div className="settings" id="style">
                        <h2>General</h2>
                        <label htmlFor="header_background">
                            Header background
                            <small>header background colour</small>
                        </label>
                        <input
                            type="text"
                            id="header_background"
                            value={this.state.styleSettings.header_background}
                            onChange={_.partial(
                                this.handleSettingUpdate,
                                'styleSettings', 'header_background',
                            )}
                        />

                        <label htmlFor="undo_ms">
                            Undo time (ms)
                            <small>length of time to undo actions</small>
                        </label>
                        <input
                            type="number"
                            id="undo_ms"
                            value={this.state.systemSettings.undo_ms}
                            onChange={_.partial(
                                this.handleSettingUpdate,
                                'systemSettings', 'undo_ms',
                            )}
                        />

                        <label htmlFor="sync_interval">
                            Update interval (ms)
                            <small>
                                how often to fetch new emails
                            </small>
                        </label>
                        <input
                            required
                            type="number"
                            id="sync_interval"
                            value={this.state.systemSettings.sync_interval}
                            onChange={_.partial(
                                this.handleSettingUpdate,
                                'systemSettings', 'sync_interval',
                            )}
                        />
                    </div>

                    {this.renderAdvancedSettings()}

                    <button
                        type="submit"
                        className="main-button submit"
                        onClick={this.handleSaveSettings}
                    >Save all settings &rarr;</button>
                </section>
            </div>
        );
    }
}
