import { BaseStore } from 'stores/base.jsx';


class FilterStore extends BaseStore {
    /*
        Global store to fetch/hold any filters.
    */

    static storeKey = 'filterStore';

    constructor() {
        super();

        this.props = {
            accountName: null,
            mainColumn: 'inbox',
        };
    }

    setAccountFilter(accountName) {
        this.props.accountName = accountName;
        this.triggerUpdate();
    }

    setMainColumn(columnName) {
        if (this.props.mainColumn !== columnName) {
            this.props.mainColumn = columnName;
            this.triggerUpdate();
        }
    }
}


const filterStore = new FilterStore();
export default filterStore;
