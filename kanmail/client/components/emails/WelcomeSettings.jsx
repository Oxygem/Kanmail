import _ from 'lodash';
import React from 'react';

import AccountList from 'components/settings/AccountList.jsx';
import AccountSettingsMixin from 'components/settings/AccountSettingsMixin.jsx';

import img from 'icon.png';
import keyboard from 'keyboard.js';
import { makeDragElement } from 'window.js';

import { put } from 'util/requests.js';


export default class WelcomeSettings extends AccountSettingsMixin {
    constructor(props) {
        super(props);

        keyboard.disable();

        this.state = {
            accounts: [],
            accountNameToConnected: {},
            contactIcons: true,
        };
    }

    handleSaveSettings = (ev) => {
        ev.preventDefault();

        if (this.state.isSaving) {
            if (this.state.saveError) {
                this.setState({isSaving: false, saveError: null});
            }
            return;
        }

        this.setState({isSaving: true});

        const newSettings = {
            accounts: this.state.accounts,
            system: {
                load_contact_icons: this.state.contactIcons,
            },
        };

        put('/api/settings', newSettings)
            .then(() => {
                this.setState({isSaved: true});
                window.location.reload();
            })
            .catch(err => this.setState({saveError: err}));
    }

    renderSaveButton() {
        if (_.isEmpty(this.state.accounts)) {
            return;
        }

        let text = <span>Start using Kanmail <i className="fa fa-arrow-right" /></span>;
        const classes = ['main-button'];

        if (this.state.isSaving) {
            if (this.state.saveError) {
                text = `Error saving settings: ${this.state.saveError.data.errorMessage}`;
                classes.push('error');
            } else if (this.state.isSaved) {
                text = 'Settings saved, please reload the window';
                classes.push('disabled');
            } else {
                text = 'Saving...';
                classes.push('disabled');
            }
        } else {
            classes.push('submit');
        }

        return (
            <button
                type="submit"
                className={classes.join(' ')}
                onClick={this.handleSaveSettings}
            >{text}</button>
        );
    }

    renderContactIconCheckbox() {
        if (_.isEmpty(this.state.accounts) || this.state.isSaved) {
            return;
        }

        return (
            <small>
                <input
                    id="use-contact-icons"
                    type="checkbox"
                    checked={this.state.contactIcons}
                    onChange={() => this.setState({contactIcons: !this.state.contactIcons})}
                />
                <label htmlFor="use-contact-icons">Use gravatar & duckduckgo for contact icons?</label>
            </small>
        );
    }

    render() {
        return (
            <section className={window.KANMAIL_PLATFORM}>
                <header className="welcome-settings header-bar" ref={makeDragElement}>
                    <h2>Setup Kanmail</h2>
                </header>

                <section id="welcome-settings">
                    <h2><img src={img} width="48px" /> Kanmail</h2>
                    <p>
                        Welcome to Kanmail. Setup one or more accounts below to start managing your emails.
                        {this.renderSaveButton()}
                        {this.renderContactIconCheckbox()}
                    </p>
                    <AccountList
                        accounts={this.state.accounts}
                        accountNameToConnected={this.state.accountNameToConnected}
                        addAccount={this.addAccount}
                        deleteAccount={this.deleteAccount}
                        updateAccount={this.updateAccount}
                        moveAccount={this.moveAccount}
                        newAccountFormProps={{
                            addingAccount: this.state.accounts.length === 0,
                        }}
                    />
                </section>
            </section>
        );
    }
}
