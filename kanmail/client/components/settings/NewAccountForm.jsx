import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import { openLink } from 'window.js';
import { APPLE_APP_PASSWORD_LINK } from 'constants.js';

import gmailLogo from 'images/providers/gmail.png';
import icloudLogo from 'images/providers/icloud.png';
import outlookLogo from 'images/providers/outlook.png';
import yahooLogo from 'images/providers/yahoo.png';
import AccountForm from 'components/settings/AccountForm.jsx';

import { delete_, get, post } from 'util/requests.js';


class GenericAccountForm extends React.Component {
    static propTypes = {
        closeForm: PropTypes.func.isRequired,
        completeAddNewAccount: PropTypes.func.isRequired,
        handleAddAccountError: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = {
            newAccountError: null,

            // First phase
            newAccountUsername: '',
            newAccountPassword: '',

            // Second phase
            newAccountSettings: null,
            newAccountName: '',
            newAccountAddressEmail: '',
            newAccountAddressName: '',
        };
    }

    getAutoconfDomain() {
        return null;
    }

    handleAddAccount = (ev) => {
        ev.preventDefault();

        if (this.state.isLoadingNewAccount) {
            return;
        }

        if (
            !this.state.newAccountUsername ||
            !this.state.newAccountPassword
        ) {
            this.setState({
                newAccountError: 'Email or password missing!',
            });
            return;
        }

        const data = {
            username: this.state.newAccountUsername,
            password: this.state.newAccountPassword,
            autoconf_domain: this.getAutoconfDomain(),
        };

        const handleSettings = (data) => {
            if (data.connected) {
                this.setState({
                    newAccountError: null,
                    newAccountAddressEmail: this.state.newAccountUsername,
                    newAccountSettings: data.settings,
                });
                return;
            }

            if (data.json.did_autoconf) {
                this.setState({
                    newAccountError: (
                        <span>Invalid email or password! You may need to enable IMAP access with your provider. See <a onClick={() => openLink('https://kanmail.io/docs/email-providers')}><strong>our help page for more information</strong></a>. Provider error:<br /><code>{data.json.error_message}</code></span>
                    ),
                    isLoadingNewAccount: false,
                });
                return;
            }

            this.props.handleAddAccountError(data);
        }

        this.setState({isLoadingNewAccount: true});

        // Post to new endpoint - hopefully it will autoconfigure and connect itself
        post('/api/account/new', data, {ignoreStatus: [400]})
            .then(handleSettings)
            .catch(err => handleSettings(err.data),
        );
    }

    handleCompleteAddAccount = (ev) => {
        ev.preventDefault();

        if (!this.state.newAccountName) {
            this.setState({
                newAccountError: 'Please provide an account display name!',
            });
            return;
        }

        const settings = this.state.newAccountSettings;
        settings.name = this.state.newAccountName;
        settings.contacts = [
            [this.state.newAccountAddressName, this.state.newAccountAddressEmail],
        ];

        this.props.completeAddNewAccount(null, settings);
    }

    handleUpdate = (stateKey, ev) => {
        this.setState({
            [stateKey]: ev.target.value,
        });
    }

    renderTitle() {
        return <h3><i className="fa fa-envelope" /> Add New Account</h3>;
    }

    renderUnderTitle() {
        return null;
    }

    renderNewAccountForm() {
        return (
            <div>
                {this.renderUnderTitle()}
                <div>
                    <label htmlFor="username">Email</label>
                    <input
                        id="username"
                        type="email"
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

                <div className="account-control-buttons">
                    <button
                        type="submit"
                        className={`submit ${this.state.isLoadingNewAccount && 'disabled'}`}
                        onClick={this.handleAddAccount}
                    >Add account</button>
                    <button className="cancel" onClick={this.props.closeForm}>Cancel</button>
                </div>
            </div>
        );
    }

    renderCompleteNewAccountForm() {
        return (
            <div>
                <p>Account <span className="green">connected</span>! Customize the new account below:</p>
                <div>
                    <label htmlFor="account-name">Account display name (eg Work, Personal)</label>
                    <input
                        id="account-name"
                        value={this.state.newAccountName}
                        onChange={_.partial(this.handleUpdate, 'newAccountName')}
                    />
                </div>

                <div>
                    <label htmlFor="address-email">Email address to send from</label>
                    <input
                        id="address-email"
                        type="email"
                        value={this.state.newAccountAddressEmail}
                        onChange={_.partial(this.handleUpdate, 'newAccountAddressEmail')}
                    />
                </div>

                <div>
                    <label htmlFor="address-name">Name to send from</label>
                    <input
                        id="address-name"
                        value={this.state.newAccountAddressName}
                        onChange={_.partial(this.handleUpdate, 'newAccountAddressName')}
                    />
                </div>

                <div className="account-control-buttons">
                    <button
                        type="submit"
                        className="submit"
                        onClick={this.handleCompleteAddAccount}
                    >Complete adding account</button>
                </div>
            </div>
        );
    }

    render() {
        return (
            <div className="wide">
                {this.renderTitle()}
                <div className="error">{this.state.newAccountError}</div>
                {this.state.newAccountSettings ? this.renderCompleteNewAccountForm() : this.renderNewAccountForm()}
            </div>
        );
    }
}

class OauthAccountFormMixin extends GenericAccountForm {
    constructor(props) {
        super(props);
        this.state.oauthError = null;
        this.state.oauthRequestId = null;
        this.oauthRequestCheck = setInterval(this.checkForOauthRequest, 1000);
    }

    componentDidMount() {
        post(
            '/api/oauth/request',
            {oauth_provider: this.getOauthProvider()},
        ).then(data => {
            // Open OAuth request in browser window
            openLink(data.auth_url);
            // Start checking for the response
            this.setState({oauthRequestId: data.uid});
        });
    }

    componentWillUnmount() {
        clearInterval(this.oauthRequestCheck);
    }

    checkForOauthRequest = () => {
        if (!this.state.oauthRequestId) {
            return;
        }

        get(`/api/oauth/response/${this.state.oauthRequestId}`).then(oauthData => {
            if (!oauthData.response) {
                return;
            }

            clearInterval(this.oauthRequestCheck);

            const data = {
                username: oauthData.response.email,
                oauth_access_token: oauthData.response.access_token,
                oauth_refresh_token: oauthData.response.refresh_token,
                oauth_provider: this.getOauthProvider(),
                autoconf_domain: this.getAutoconfDomain(),
            };

            const handleSettings = (data) => {
                // Cleanup the OAuth response in the backend
                delete_(`/api/oauth/response/${this.state.oauthRequestId}`);

                if (data.connected) {
                    this.setState({
                        newAccountAddressEmail: oauthData.response.email,
                        newAccountSettings: data.settings,
                    });
                    return;
                }

                if (data.json.did_autoconf) {
                    this.setState({
                        newAccountError: 'Authentication failed!',
                        isLoadingNewAccount: false,
                    });
                    return;
                }

                this.props.handleAddAccountError(data);
            }

            this.setState({isLoadingNewAccount: true});

            // Post to new endpoint - hopefully it will autoconfigure and connect itself
            post('/api/account/new', data, {ignoreStatus: [400]})
                .then(handleSettings)
                .catch(err => handleSettings(err.data),
            );
        });
    }

    getAutoconfDomain() {
        return 'gmail.com';
    }

    renderTitle() {
        return <h3><img src={gmailLogo} /> Add Gmail Account</h3>;
    }

    renderNewAccountForm() {
        return (
            <div className="account-control-buttons">
                <span>Waiting for confirmation!</span>
                <button className="cancel" onClick={this.props.closeForm}>Cancel</button>
            </div>
        );
    }
}

class GmailAccountForm extends OauthAccountFormMixin {
    getOauthProvider() {
        return 'gmail';
    }

    getAutoconfDomain() {
        return 'gmail.com';
    }

    renderTitle() {
        return <h3><img src={gmailLogo} /> Sign in with Google</h3>;
    }
}

class IcloudAccountForm extends GenericAccountForm {
    getAutoconfDomain() {
        return 'icloud.com';
    }

    renderTitle() {
        return <h3><img src={icloudLogo} /> Add iCloud Account</h3>;
    }

    renderUnderTitle() {
        return <p>iCloud accounts must use an <a onClick={() => openLink(APPLE_APP_PASSWORD_LINK)}>app specific password</a> for any non-Apple email access.</p>;
    }
}

class OutlookAccountForm extends GenericAccountForm {
    getAutoconfDomain() {
        return 'outlook.com';
    }

    renderTitle() {
        return <h3><img src={outlookLogo} /> Add Outlook Account</h3>;
    }
}

class YahooAccountForm extends GenericAccountForm {
    getAutoconfDomain() {
        return 'yahoo.com';
    }

    renderTitle() {
        return <h3><img src={yahooLogo} /> Add Yahoo Account</h3>;
    }
}

const ACCOUNT_TYPE_TO_COMPONENT = {
    'gmail': GmailAccountForm,
    'icloud': IcloudAccountForm,
    'outlook': OutlookAccountForm,
    'yahoo': YahooAccountForm,
    'generic': GenericAccountForm,
};

const getInitialState = () => ({
    // Add account phase 1 - name/username/password autoconfig form
    newAccountName: '',
    newAccountError: null,

    // Add account phase 2 - manual config if auto fails
    isLoadingNewAccount: false,
    manuallyConfiguringAccount: false,
    newAccountSettings: null,
});

const getEmptyAccountSettings = () => ({
    'imap_connection': {
        'ssl': true,
        'ssl_verify_hostname': true,
    },
    'smtp_connection': {
        'ssl': true,
        'ssl_verify_hostname': true,
    },
});


export default class NewAccountForm extends React.Component {
    static propTypes = {
        addItem: PropTypes.func.isRequired,
        closeForm: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = getInitialState(props);
    }

    resetState = () => {
        const state = getInitialState(this.props);
        this.setState(state);
    }

    handleAddAccountError = (data) => {
        let newAccountSettings = getEmptyAccountSettings();
        if (data.json.settings) {
            newAccountSettings = _.merge(newAccountSettings, data.json.settings);
        }
        this.setState({
            isLoadingNewAccount: false,
            manuallyConfiguringAccount: true,
            newAccountSettings,
            newAccountError: data.errorMessage,
            newAccountErrorType: data.errorName,
        });
    }

    handleClickManualAddAccount = () => {
        this.setState({
            isLoadingNewAccount: false,
            manuallyConfiguringAccount: true,
            newAccountSettings: getEmptyAccountSettings(),
        });
    }

    completeAddNewAccount = (_, accountSettings) => {
        this.props.addItem(accountSettings);
        this.props.closeForm();
    }

    setAccountType = (accountType) => {
        this.setState({accountType});
    }

    render() {
        if (this.state.manuallyConfiguringAccount) {
            const { newAccountSettings } = this.state;
            newAccountSettings.name = this.state.newAccountName;

            return <AccountForm
                key={this.state.newAccountName}
                connected={false}
                isAddingNewAccount={true}
                accountSettings={newAccountSettings}
                error={this.state.newAccountError}
                errorType={this.state.newAccountErrorType}
                deleteItem={this.resetState}
                updateItem={this.completeAddNewAccount}
                closeForm={this.props.closeForm}
            />
        }

        if (this.state.accountType) {
            const Component = ACCOUNT_TYPE_TO_COMPONENT[this.state.accountType];
            return (
                <form className="account new-account">
                    <Component
                        closeForm={this.props.closeForm}
                        handleAddAccountError={this.handleAddAccountError}
                        completeAddNewAccount={this.completeAddNewAccount}
                    />
                </form>
            );
        }

        return <form className="account new-account">
                <div className="new-account-buttons">
                    <button
                        onClick={_.partial(this.setAccountType, 'gmail')}
                    ><img src={gmailLogo} />Sign in with Google</button>
                    <button
                        onClick={_.partial(this.setAccountType, 'icloud')}
                    ><img src={icloudLogo} /> Add iCloud account</button>
                    <button
                        onClick={_.partial(this.setAccountType, 'outlook')}
                    ><img src={outlookLogo} /> Add Outlook account</button>
                    <button
                        onClick={_.partial(this.setAccountType, 'yahoo')}
                    ><img src={yahooLogo} /> Add Yahoo account</button>
                    <button
                        onClick={_.partial(this.setAccountType, 'generic')}
                    ><i className="fa fa-envelope" /> Add a different account</button>
                </div>
                <div className="account-control-buttons">
                    <button onClick={this.handleClickManualAddAccount}>Custom IMAP/SMTP</button>
                    <button className="cancel" onClick={this.props.closeForm}>Cancel</button>
                </div>
        </form>;
    }
}
