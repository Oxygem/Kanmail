import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import Account from 'components/settings/Account.jsx';

import { PROVIDERS_DOC_LINK } from 'constants.js';
import { openLink } from 'window.js';

import { post } from 'util/requests.js';


const getInitialState = () => ({
    showAdvancedSettings: false,
    isSaving: false,
    saveError: null,

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
});


export default class NewAccountForm extends React.Component {
    static propTypes = {
        addAccount: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = getInitialState(props);
    }

    resetState = () => {
        const state = getInitialState(this.props);
        this.setState(state);
    }

    handleClickManualAddAccount = () => {
        this.setState({
            isLoadingNewAccount: false,
            configuringNewAccount: true,
            newAccountSettings: {
                'imap_connection': {
                    'ssl': true,
                    'ssl_verify_hostname': true,
                },
                'smtp_connection': {
                    'ssl': true,
                    'ssl_verify_hostname': true,
                },
            },
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

        const data = {
            username: this.state.newAccountUsername,
            password: this.state.newAccountPassword,
        };

        const handleSettings = (data) => {
            if (data.connected) {
                this.props.addAccount(
                    this.state.newAccountName,
                    data.settings,
                );
                this.resetState();
                return;
            }

            this.setState({
                isLoadingNewAccount: false,
                configuringNewAccount: true,
                newAccountSettings: data.json.settings,
                newAccountError: data.errorMessage,
                newAccountErrorType: data.errorName,
            });
        }

        this.setState({isLoadingNewAccount: true});

        // Post to new endpoint - hopefully it will autoconfigure and connect itself
        post('/api/settings/account/new', data, {ignoreStatus: [400]})
            .then(handleSettings)
            .catch(err => handleSettings(err.data),
        );
    }

    handleUpdate = (stateKey, ev) => {
        this.setState({
            [stateKey]: ev.target.value,
        });
    }

    toggleAddAccount = () => {
        this.setState({
            addingAccount: !this.state.addingAccount,
        });
    }

    completeAddNewAccount = (...args) => {
        this.props.addAccount(...args);
        this.resetState();
    }

    render() {
        if (!this.state.addingAccount) {
            return <button className="submit" onClick={this.toggleAddAccount}>
                Add new account
            </button>;
        }

        if (this.state.configuringNewAccount) {
            const { newAccountSettings } = this.state;
            newAccountSettings.name = this.state.newAccountName;

            return <Account
                key={this.state.newAccountName}
                connected={false}
                alwaysEditing={true}
                accountSettings={newAccountSettings}
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

                <button onClick={this.toggleAddAccount}>
                    Cancel
                </button>
            </form>
            <p><strong>Note:</strong> Kanmail should be compatible with most email providers. Please see the <strong><a onClick={() => openLink(PROVIDERS_DOC_LINK)}>list of providers and specific requirements</a></strong> for further information.
                <br /><br />
                If you would prefer to enter IMAP/SMTP settings by hand, <a onClick={this.handleClickManualAddAccount}>click here</a>.
            </p>
        </div>;
    }
}
