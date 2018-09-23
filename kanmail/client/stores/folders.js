import requestStore from 'stores/request.js';
import { BaseStore } from 'stores/base.jsx';


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
        requestStore.get('/api/folders').then(data => {
            this.props.folders = data.folders;
            this.triggerUpdate();
        });
    }
}


const folderStore = new FolderStore();
export default folderStore;
