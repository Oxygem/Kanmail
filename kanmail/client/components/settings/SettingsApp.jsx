import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import Select, { Creatable } from 'react-select';

import AccountList from 'components/settings/AccountList.jsx';

import { THEME_NAMES } from 'constants.js';
import keyboard from 'keyboard.js';
import {
        closeWindow,
        openLicense,
        makeDragElement,
        makeNoDragElement,
} from 'window.js';

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

        this.state.styleSettings.theme_light = {
            label: this.state.styleSettings.theme_light,
            value: this.state.styleSettings.theme_light,
        };
        this.state.styleSettings.theme_dark = {
            label: this.state.styleSettings.theme_dark,
            value: this.state.styleSettings.theme_dark,
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

    handleCheckboxUpdate = (stateKey, key) => {
        const value = this.state[stateKey][key];
        return this.handleSettingUpdate(stateKey, key, !value);
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

        newSettings.style.theme_light = newSettings.style.theme_light.value;
        newSettings.style.theme_dark = newSettings.style.theme_dark.value;

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

                {window.KANMAIL_LICENSED && <div className="no-input">
                    <label>
                        Update license
                        <small>
                            Change or remove the license key
                        </small>
                    </label>
                    <button
                        className=""
                        onClick={openLicense}
                    >Open license settings</button>
                </div>}
            </div>
        );
    }

    renderSaveButton() {
        let text = <span><i className="fa fa-save" /> Save</span>;
        const classes = [];

        if (this.state.isSaving) {
            if (this.state.saveError) {
                text = `Error saving settings: ${this.state.saveError.data.errorMessage}`;
                classes.push('error');
            } else if (this.state.isSaved) {
                text = 'Settings saved, please close this window & reload the main one';
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
                ref={makeNoDragElement}
            >{text}</button>
        );
    }

    render() {
        const themeOptions = _.map(THEME_NAMES, themeName => ({
            value: themeName,
            label: themeName,
        }));

        return (
            <section className="no-select">
                <header className="settings flex header-bar" ref={makeDragElement}>
                    <h2>Settings</h2>
                    <div>
                        {this.renderSaveButton()}
                    </div>
                </header>

                <section id="settings">
                    <div className="settings">
                        <h2 className="accounts">Accounts</h2>
                        <small>Changes will not be saved until you save all settings at the bottom of the page.</small>
                    </div>

                    <AccountList
                        accounts={this.state.accounts}
                        addAccount={this.addAccount}
                        deleteAccount={this.deleteAccount}
                        updateAccount={this.updateAccount}
                        moveAccount={this.moveAccount}
                    />

                    <div className="settings" id="style">
                        <h2>Appearance</h2>
                        <label htmlFor="theme_light">
                            Light theme
                            <small>Theme to use when the system theme is light</small>
                        </label>
                        <div className="select-wrapper">
                            <Select
                                classNamePrefix="react-select"
                                options={themeOptions}
                                value={this.state.styleSettings.theme_light}
                                onChange={_.partial(
                                    this.handleSettingUpdate,
                                    'styleSettings', 'theme_light',
                                )}
                            />
                        </div>

                        <label htmlFor="theme_dark">
                            Dark theme
                            <small>Theme to use when the system theme is dark</small>
                        </label>
                        <div className="select-wrapper">
                            <Select
                                classNamePrefix="react-select"
                                options={themeOptions}
                                value={this.state.styleSettings.theme_dark}
                                onChange={_.partial(
                                    this.handleSettingUpdate,
                                    'styleSettings', 'theme_dark',
                                )}
                            />
                        </div>

                        <label htmlFor="sidebar_folders">
                            Sidebar folders
                            <small>
                                Folders to pin in the sidebar
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

                        <label htmlFor="group_single_sender_threads">
                            Group single sender threads
                            <small>Groups single message threads from the same sender</small>
                        </label>
                        <input
                            type="checkbox"
                            id="group_single_sender_threads"
                            checked={this.state.systemSettings.group_single_sender_threads}
                            onChange={_.partial(
                                this.handleCheckboxUpdate,
                                'systemSettings', 'group_single_sender_threads',
                            )}
                        />

                        <label htmlFor="load_contact_icons">
                            Load contact icons
                            <small>Lookup gravatars and favicons for contacts</small>
                        </label>
                        <input
                            type="checkbox"
                            id="load_contact_icons"
                            checked={this.state.systemSettings.load_contact_icons}
                            onChange={_.partial(
                                this.handleCheckboxUpdate,
                                'systemSettings', 'load_contact_icons',
                            )}
                        />

                        <label htmlFor="show_help_button">
                            Show help button
                        </label>
                        <input
                            type="checkbox"
                            id="show_help_button"
                            checked={this.state.systemSettings.show_help_button}
                            onChange={_.partial(
                                this.handleCheckboxUpdate,
                                'systemSettings', 'show_help_button',
                            )}
                        />
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
                </section>
            </section>
        );
    }
}
