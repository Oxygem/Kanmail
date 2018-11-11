import { BaseStore } from 'stores/base.jsx';

import { get, put } from 'util/requests.js';


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

    addColumn(newColumn) {
        this.props.columns.push(newColumn);

        // Save the new list of columns via the API before updating
        return put('/api/settings', {
            columns: this.props.columns,
        }).then(() => {
            this.triggerUpdate();
        });
    }

    getSettings() {
        return get('/api/settings').then(data => {
            this.props.columns = data.settings.columns || [];
            this.props.accounts = data.settings.accounts || {};

            this.props.systemSettings = data.settings.system || {};
            this.props.styleSettings = data.settings.style || {};

            // Store the original for the settings "app"
            this.props.originalSettings = data.settings;

            this.triggerUpdate();
            return this.props;
        });
    }
}


const settingsStore = new SettingsStore();
export default settingsStore;
