import { BaseStore } from 'stores/base.jsx';


function makeDefaults() {
    return {
        open: false,
    };
}


class SearchStore extends BaseStore {
    static storeKey = 'searchStore';

    constructor() {
        super();

        this.props = makeDefaults();
    }

    open = () => {
        this.props.open = true;
        this.triggerUpdate();
    }

    close = () => {
        if (this.props.open) {
            this.props = makeDefaults();
            this.triggerUpdate();
        }
    }

    toggle = () => {
        if (this.props.open) {
            this.close();
        } else {
            this.open();
        }
    }
}


const searchStore = new SearchStore();
export default searchStore;
