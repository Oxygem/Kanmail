import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { Creatable } from 'react-select';

import HeaderBar from 'components/HeaderBar.jsx';
import Account from 'components/settings/Account.jsx';
import NewAccountForm from 'components/settings/NewAccountForm.jsx';

import keyboard from 'keyboard.js';
import { closeWindow } from 'window.js';

import { delete_, put } from 'util/requests.js';
import { arrayMove } from 'util/array.js';


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
        };

        const sidebarFolderOptions = _.map(
            this.state.styleSettings.sidebar_folders,
            folder => ({label: folder, value: folder}),
        );

        this.state.initialSidebarFolderOptions = sidebarFolderOptions;
        this.state.styleSettings.sidebar_folders = sidebarFolderOptions;
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

    handleUpdate = (stateKey, ev) => {
        this.setState({
            [stateKey]: ev.target.value,
        });
    }

    handleSettingUpdate = (stateKey, key, value) => {
        const settings = this.state[stateKey];
        settings[key] = value;

        this.setState({
            [stateKey]: settings,
        });
    }

    handleInputUpdate = (stateKey, key, ev) => {
        let value = ev.target.value;
        if (value && ev.target.type === 'number') {
            value = parseInt(value);
        }
        return this.handleSettingUpdate(stateKey, key, value);
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
            system: this.state.systemSettings,
            style: _.clone(this.state.styleSettings),
            columns: this.props.settings.columns,
        };

        newSettings.style.sidebar_folders = _.map(
            newSettings.style.sidebar_folders,
            option => option.value,
        );

        put('/api/settings', newSettings)
            .then(() => {
                closeWindow();
                this.setState({isSaved: true});
            })
            .catch(err => this.setState({saveError: err}));
    }

    handleBustCache = (ev) => {
        ev.preventDefault();

        delete_('/api/settings/cache')
            .then(() => closeWindow())
            .catch(err => console.error('SETTING ERROR', err));
    }

    renderAccounts() {
        return _.map(this.state.accounts, (accountSettings, i) => (
            <Account
                key={`${i}-${accountSettings.name}`}
                accountIndex={i}
                connected={true}
                accountSettings={accountSettings}
                deleteAccount={this.deleteAccount}
                updateAccount={this.updateAccount}
                moveUp={_.partial(this.moveAccount, i, -1)}
                moveDown={_.partial(this.moveAccount, i, 1)}
            />
        ));
    }

    renderAdvancedSettings() {
        if (!this.state.showAdvancedSettings) {
            return (
                <div className="settings" id="system">
                    <button
                        className="cancel"
                        onClick={() => this.setState({showAdvancedSettings: true})}
                    >Show advanced settings <i className="fa fa-arrow-down" /></button>
                </div>
            );
        }

        return (
             <div className="settings advanced" id="system">
                 <button
                    className="cancel"
                    onClick={() => this.setState({showAdvancedSettings: false})}
                >Hide advanced settings <i className="fa fa-arrow-up" /></button>

                <h2>
                    Advanced <small>
                        <i className="red fa fa-exclamation-triangle" /> danger zone
                    </small>
                </h2>
                <label htmlFor="batch_size">
                    Batch size
                    <small>Number of emails to fetch at once.</small>
                </label>
                <input
                    required
                    type="number"
                    id="batch_size"
                    value={this.state.systemSettings.batch_size}
                    onChange={_.partial(
                        this.handleInputUpdate,
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
                        this.handleInputUpdate,
                        'systemSettings', 'initial_batches',
                    )}
                />

                <label>
                    Clear cache
                    <small>
                        Any settings changes will be lost,<br />
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

    renderSaveButton() {
        if (this.state.isSaving) {
            let text;
            const classes = ['main-button'];

            if (this.state.saveError) {
                text = `Error saving settings: ${this.state.saveError.data.errorMessage}`;
                classes.push('inactive');
            } else if (this.state.isSaved) {
                text = 'Settings saved, please close this window & reload the main one';
                classes.push('disabled');
            } else {
                text = 'Saving...';
                classes.push('disabled');
            }

            return (
                <button
                    type="submit"
                    className={classes.join(' ')}
                    onClick={this.handleSaveSettings}
                >{text}</button>
            );
        }

        return (
            <button
                type="submit"
                className="main-button submit"
                onClick={this.handleSaveSettings}
            >Save all settings &rarr;</button>
        );
    }

    render() {
        return (
            <div>
                <HeaderBar />

                <section id="settings">
                    <div id="accounts">
                        <h2>Accounts</h2>
                        <small>Changes will not be saved until you save all settings at the bottom of the page.</small>
                        {this.renderAccounts()}
                        <div id="add-account">
                            <NewAccountForm addAccount={this.addAccount} />
                        </div>
                    </div>

                    <div className="settings" id="style">
                        <h2>Appearance</h2>
                        <label htmlFor="header_background">
                            Header background
                            <small>Header background colour</small>
                        </label>
                        <input
                            type="text"
                            id="header_background"
                            value={this.state.styleSettings.header_background}
                            onChange={_.partial(
                                this.handleInputUpdate,
                                'styleSettings', 'header_background',
                            )}
                        />

                        <label htmlFor="sidebar_folders">
                            Sidebar folders
                            <small>
                                Folders to show in the sidebar
                            </small>
                        </label>
                        <div className="select-wrapper">
                            <Creatable
                                isMulti
                                defaultOptions
                                cacheOptions
                                classNamePrefix="react-select"
                                options={this.state.initialSidebarFolderOptions}
                                value={this.state.styleSettings.sidebar_folders}
                                onChange={_.partial(
                                    this.handleSettingUpdate,
                                    'styleSettings', 'sidebar_folders',
                                )}
                            />
                        </div>
                    </div>

                    <div className="settings" id="style">
                        <h2>Sync</h2>
                        <label htmlFor="undo_ms">
                            Undo time (ms)
                            <small>Length of time to undo actions</small>
                        </label>
                        <input
                            type="number"
                            id="undo_ms"
                            value={this.state.systemSettings.undo_ms}
                            onChange={_.partial(
                                this.handleInputUpdate,
                                'systemSettings', 'undo_ms',
                            )}
                        />

                        <label htmlFor="sync_interval">
                            Update interval (ms)
                            <small>
                                How often to fetch new emails
                            </small>
                        </label>
                        <input
                            required
                            type="number"
                            id="sync_interval"
                            value={this.state.systemSettings.sync_interval}
                            onChange={_.partial(
                                this.handleInputUpdate,
                                'systemSettings', 'sync_interval',
                            )}
                        />

                        <label htmlFor="sync_days">
                            Sync days
                            <small>
                                Days of email to sync (0 = all)<br />
                                note: this does not affect search
                            </small>
                        </label>
                        <input
                            required
                            type="number"
                            id="sync_days"
                            value={this.state.systemSettings.sync_days}
                            onChange={_.partial(
                                this.handleInputUpdate,
                                'systemSettings', 'sync_days',
                            )}
                        />
                    </div>

                    {this.renderAdvancedSettings()}
                    {this.renderSaveButton()}
                </section>
            </div>
        );
    }
}
