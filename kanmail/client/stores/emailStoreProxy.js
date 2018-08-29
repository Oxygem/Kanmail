import _ from 'lodash';

import settingsStore from 'stores/settings.js';

import mainEmailStore from 'emails/main.js';
import searchEmailStore from 'emails/search.js';


class EmailStoreProxy {
    /*
        A hacky wrapper around the "main" (normal, date based) and search email
        stores. We keep them separate such that we essentially switch between
        the two modes. This is a bit of a mess but it currently handles
        switching between the two modes and kicking off the search requests.

        TODO: make this more React-y by having all the columns wrapped by some
        state and a store so we re-render the column area of the app when
        switching between modes. Currently the columns remain and we simply
        alter their data.
    */

    constructor(...stores) {
        this.stores = stores;
        this.activeStore = stores[0];
    }

    setActiveStore(activeStore) {
        this.activeStore = activeStore;

        _.each(this.stores, store => {
            store.active = store === activeStore;
        });
    }

    search(searchValue) {
        searchEmailStore.setSearchValue(searchValue);

        // Set the mode and (re)process everything
        this.setActiveStore(searchEmailStore);
        searchEmailStore.processEmailChanges({forceUpdate: true});

        // Kick off the search requests for columns first
        const requests = _.map(settingsStore.props.columns, folderName => (
            searchEmailStore.getFolderEmails(folderName, {query: {reset: true}})
        ));

        // Then once complete do inbox/archive
        Promise.all(requests).then(_.each(['inbox', 'archive'], folderName =>(
            searchEmailStore.getFolderEmails(folderName, {query: {reset: true}})
        )));
    }

    stopSearching() {
        this.setActiveStore(mainEmailStore);

        // As above; set the mode and (re)process everything
        this.searchMode = false;
        mainEmailStore.processEmailChanges({forceUpdate: true});
    }

    getCurrentEmailStore() {
        return this.activeStore;
    }
}


const emailStoreProxy = new EmailStoreProxy(mainEmailStore, searchEmailStore);
export default emailStoreProxy;


export function getEmailStore() {
    return emailStoreProxy.getCurrentEmailStore();
}
