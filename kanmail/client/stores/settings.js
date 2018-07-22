import { BaseStore } from 'stores/base.jsx';
import { get } from 'util/requests.js';


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
            settingsFile: null,
        };
    }

    addColumn(newColumn) {
        this.props.columns.push(newColumn);

        // TODO: PUSH column to settings on server FIRST

        this.triggerUpdate();
    }

    getSettings() {
        return get('/api/settings').then(data => {
            this.props.columns = data.settings.columns;
            this.props.accounts = data.settings.accounts;
            this.props.systemSettings = data.settings.system;
            this.props.settingsFile = data.settings_file;
            this.triggerUpdate();
        });
    }
}


const settingsStore = new SettingsStore();
export default settingsStore;
