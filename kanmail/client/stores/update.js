import { BaseStore } from 'stores/base.jsx';

import { get, post } from 'util/requests.js';


class UpdateStore extends BaseStore {
    /*
        Global store of the users app settings.
    */

    static storeKey = 'updateStore';

    constructor() {
        super();

        this.props = {
            updateVersion: null,
            updateReady: false,
            updateDownloading: false,
            updateError: null,
        };
    }

    checkUpdate() {
        return get('/api/update').then(data => {
            if (data.update) {
                this.props.updateVersion = data.update;
            }
            this.triggerUpdate();
        });
    }

    doUpdate() {
        this.props.updateDownloading = true;
        this.triggerUpdate();

        // Just do the post - it'll nuke the window!
        return post('/api/update').then(() => {
            this.props.updateReady = true;
            this.triggerUpdate();
        }).catch((e) => {
            this.props.updateDownloading = false;
            this.props.updateError = e.data ? e.data.errorMessage : 'unknown';
            this.triggerUpdate();
        });
    }
}


const updateStore = new UpdateStore();
export default updateStore;
