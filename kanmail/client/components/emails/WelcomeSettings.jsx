import _ from 'lodash';
import React from 'react';

import HeaderBar from 'components/HeaderBar.jsx';
import AccountList from 'components/settings/AccountList.jsx';

import img from 'icon-pink.png';
import keyboard from 'keyboard.js';
import { closeWindow } from 'window.js';

import { put } from 'util/requests.js';
import { arrayMove } from 'util/array.js';


export default class WelcomeSettings extends React.Component {
    constructor(props) {
        super(props);

        keyboard.disable();

        this.state = {
            accounts: [],
        };
    }

    deleteAccount = (accountIndex) => {
        const accounts = _.filter(this.state.accounts, (_, i) => i !== accountIndex);
        this.setState({accounts});
    }

    updateAccount = (accountIndex, newSettings) => {
        if (!this.state.accounts[accountIndex]) {
            throw Error('nope');
        }

        const accounts = this.state.accounts;
        accounts[accountIndex] = newSettings;
        this.setState({accounts});
    }

    addAccount = (name, newSettings) => {
        newSettings.name = name;

        const accounts = this.state.accounts;
        accounts.push(newSettings);

        this.setState({accounts});
    }

    moveAccount = (index, position) => {
        const accounts = this.state.accounts;
        arrayMove(accounts, index, index + position);
        this.setState({accounts});
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
        };

        put('/api/settings', newSettings)
            .then(() => {
                closeWindow();
                this.setState({isSaved: true});
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

    render() {
        return (
            <section className={window.KANMAIL_PLATFORM}>
                <HeaderBar />
                <section id="welcome-settings">
                    <h2><img src={img} width="48px" /> Kanmail</h2>
                    <p>
                        Welcome to Kanmail. Setup one or more accounts below to start managing your emails.
                        {this.renderSaveButton()}
                    </p>
                    <AccountList
                        accounts={this.state.accounts}
                        addAccount={this.addAccount}
                        deleteAccount={this.deleteAccount}
                        updateAccount={this.updateAccount}
                        moveAccount={this.moveAccount}
                        newAccountFormProps={{
                            addingAccount: this.state.accounts.length === 0,
                            hideCancelButton: this.state.accounts.length === 0,
                        }}
                    />
                </section>
            </section>
        );
    }
}
