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
            accounts: {},
        };
    }

    updateColumnsTriggerState() {
        // Save the new list of columns via the API before updating
        return post('/api/settings', {
            columns: this.props.columns,
        }).then(() => {
            this.triggerUpdate();
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

    getSettings() {
        return get('/api/settings').then(data => {
            this.props.columns = data.settings.columns || [];
            this.props.accounts = data.settings.accounts || [];

            this.props.systemSettings = data.settings.system || {};
            this.props.styleSettings = data.settings.style || {};

            // Store the original for the settings "app"
            this.props.originalSettings = data.settings;

            this.triggerUpdate();
            return this.props;
        });
    }

    getAccountSettings(accountName) {
        return _.find(this.props.accounts, account => account.name === accountName);
    }
}


const settingsStore = new SettingsStore();
export default settingsStore;
