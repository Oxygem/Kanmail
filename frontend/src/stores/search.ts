import { BaseStore } from "./base.tsx";
import emailStoreController from "./emails/controller.ts";

function makeDefaults() {
  return {
    isSearching: false,
  };
}

class SearchStore extends BaseStore {
  static storeKey = "searchStore";

  focusHandler: (() => void) | null = null;

  constructor() {
    super();

    this.props = makeDefaults();
  }

  setFocusHandler = (handler: (() => void) | null) => {
    this.focusHandler = handler;
  };

  focus = () => {
    if (this.focusHandler) {
      this.focusHandler();
    }
  };

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
