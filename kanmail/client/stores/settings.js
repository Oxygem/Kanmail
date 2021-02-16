import _ from 'lodash';

import { BaseStore } from 'stores/base.jsx';

import { get, post } from 'util/requests.js';
import { arrayMove } from 'util/array.js';


class SettingsStore extends BaseStore {
    /*
        Global store of the users app settings.
    */

    static storeKey = 'settingsStore';

    constructor() {
        super();

        this.props = {
            columns: [],
            accounts: [],
            systemSettings: {},
            styleSettings: {},
        };
    }

    updateColumnsTriggerState() {
        // Save the new list of columns via the API before updating
        return post('/api/settings', {
            columns: this.props.columns,
        }).then(() => {
            this.triggerUpdate(['columns']);
        });
    }

    addColumn(name) {
        this.props.columns.push(name);
        this.updateColumnsTriggerState();
    }

    removeColumn(name) {
        this.props.columns = _.without(this.props.columns, name);
        this.updateColumnsTriggerState();
    }

    moveColumn(name, position) {
        const index = this.props.columns.indexOf(name);
        arrayMove(this.props.columns, index, index + position);
        this.updateColumnsTriggerState();
    }

    moveColumnLeft(name) {
        this.moveColumn(name, -1);
    }

    moveColumnRight(name) {
        this.moveColumn(name, 1);
    }

    updateSidebarFoldersTriggerState() {
        // Save the new style settings via the API before updating
        return post('/api/settings', {
            style: this.props.styleSettings,
        }).then(() => {
            this.triggerUpdate(['styleSettings']);
        });
    }

    addSidebarFolder(name) {
        if (this.props.styleSettings.sidebar_folders.indexOf(name) > -1) {
            return;
        }

        this.props.styleSettings.sidebar_folders.push(name);
        this.updateSidebarFoldersTriggerState();
    }

    removeSidebarFolder(name) {
        if (this.props.styleSettings.sidebar_folders.indexOf(name) < 0) {
            return;
        }

        this.props.styleSettings.sidebar_folders = _.without(
            this.props.styleSettings.sidebar_folders,
            name,
        );
        this.updateSidebarFoldersTriggerState();
    }

    getSettings() {
        return get('/api/settings').then(data => {
            this.props.columns = data.settings.columns || [];
            this.props.accounts = data.settings.accounts || [];

            this.props.systemSettings = data.settings.system || {};
            this.props.styleSettings = data.settings.style || {};

            // Store the original for the settings "app"
            this.props.originalSettings = data.settings;

            const accountEmails = new Set();
            _.each(this.props.accounts, account => {
                _.each(account.contacts, contact => accountEmails.add(contact[1]));
            });
            this.props.accountEmails = accountEmails;

            this.triggerUpdate();
            return this.props;
        });
    }

    getAccountSettings(accountName) {
        return _.find(this.props.accounts, account => account.name === accountName);
    }
}


const settingsStore = new SettingsStore();

window.settingsStore = settingsStore;
export default settingsStore;
