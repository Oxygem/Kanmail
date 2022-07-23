import { BaseStore } from 'stores/base.jsx';
import emailStoreController from 'stores/emails/controller.js';


function makeDefaults() {
    return {
        isSearching: false,
    };
}


class SearchStore extends BaseStore {
    static storeKey = 'searchStore';

    constructor() {
        super();

        this.props = makeDefaults();
    }

    open = () => {
        this.props.isSearching = true;
        this.triggerUpdate();
        emailStoreController.startSearching();
    }

    close = () => {
        if (this.props.isSearching) {
            this.props = makeDefaults();
            this.triggerUpdate();
            emailStoreController.stopSearching();
        }
    }

    toggle = () => {
        if (this.props.isSearching) {
            this.close();
        } else {
            this.open();
        }
    }
}


const searchStore = new SearchStore();
export default searchStore;
