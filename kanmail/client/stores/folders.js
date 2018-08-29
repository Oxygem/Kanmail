import requestStore from 'stores/request.js';
import { BaseStore } from 'stores/base.jsx';

import { addMessage, deleteMessage } from 'util/messages.js';


class FolderStore extends BaseStore {
    /*
        Global store to fetch/hold the list of folder names across accounts.
    */

    static storeKey = 'folderStore';

    constructor() {
        super();

        this.props = {
            folders: [],
        };
    }

    getFolderNames() {
        const message = addMessage('Fetching folders...');

        requestStore.get('/api/folders').then(data => {
            this.props.folders = data.folders;
            this.triggerUpdate();
            deleteMessage(message);
        });
    }
}


const folderStore = new FolderStore();
export default folderStore;
