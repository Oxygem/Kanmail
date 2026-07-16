import _ from "lodash";

import { SEARCH_EXTRA_FOLDERS } from "../../constants.ts";
import settingsStore from "../settings.ts";
import BaseEmails from "./base.ts";
import mainEmailStore from "./main.js";
import searchEmailStore from "./search.js";

class EmailStoreController {
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

  stores: BaseEmails[];
  activeStore: BaseEmails;
  searchMode: boolean;

  constructor(...stores) {
    this.stores = stores;
    this.activeStore = stores[0];
  }

  setActiveStore(activeStore) {
    this.activeStore = activeStore;

    _.each(this.stores, (store) => {
      store.active = store === activeStore;
    });
  }

  search(searchValue) {
    searchEmailStore.setSearchValue(searchValue);

    // Also search archive/trash so results outside the visible columns show
    // up in the special search results column.
    const folderNames = _.uniq(
      _.concat(settingsStore.getCurrentColumns(), SEARCH_EXTRA_FOLDERS),
    );
    _.map(folderNames, (folderName) =>
      searchEmailStore.getFolderEmails(folderName, { reset: true })
    );
  }

  startSearching() {
    this.setActiveStore(searchEmailStore);
    searchEmailStore.processEmailChanges({ forceProcess: true });
  }

  stopSearching() {
    this.setActiveStore(mainEmailStore);

    // As above; set the mode and (re)process everything
    this.searchMode = false;
    mainEmailStore.processEmailChanges({ forceProcess: true });
  }

  getCurrentEmailStore() {
    return this.activeStore;
  }
}

const emailStoreController = new EmailStoreController(
  mainEmailStore,
  searchEmailStore
);
export default emailStoreController;

export function getEmailStore() {
  return emailStoreController.getCurrentEmailStore();
}
