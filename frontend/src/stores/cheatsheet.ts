import { BaseStore } from "./base.tsx";

function makeDefaults() {
  return {
    open: false,
  };
}

class CheatsheetStore extends BaseStore {
  static storeKey = "cheatsheetStore";

  constructor() {
    super();
    this.props = makeDefaults();
  }

  open = () => {
    if (!this.props.open) {
      this.props = { open: true };
      this.triggerUpdate();
    }
  };

  close = () => {
    if (this.props.open) {
      this.props = makeDefaults();
      this.triggerUpdate();
    }
  };

  toggle = () => {
    if (this.props.open) {
      this.close();
    } else {
      this.open();
    }
  };
}

const cheatsheetStore = new CheatsheetStore();
export default cheatsheetStore;
