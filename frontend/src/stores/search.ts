import { BaseStore } from "./base.tsx";
import emailStoreController from "./emails/controller.ts";

function makeDefaults() {
  return {
    isSearching: false,
  };
}

class SearchStore extends BaseStore {
  static storeKey = "searchStore";

  constructor() {
    super();

    this.props = makeDefaults();
  }

  open = () => {
    if (!this.props.isSearching) {
      this.props.isSearching = true;
      this.triggerUpdate();
      emailStoreController.startSearching();
    }
  };

  close = () => {
    if (this.props.isSearching) {
      this.props = makeDefaults();
      this.triggerUpdate();
      emailStoreController.stopSearching();
    }
  };

  toggle = () => {
    if (this.props.isSearching) {
      this.close();
    } else {
      this.open();
    }
  };
}

const searchStore = new SearchStore();
export default searchStore;
