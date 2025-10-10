import _ from "lodash";
import { EmailsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { BaseStore } from "./base.tsx";
import settingsStore from "./settings.ts";

interface IFilterStoreProps {
  folderNames: string[];
}

class FilterStore extends BaseStore {
  /*
        Global store to fetch/hold any filters.
    */

  static storeKey = "filterStore";

  props: IFilterStoreProps;

  constructor() {
    super();

    this.props = {
      folderNames: [],
    };
  }

  async getAccountFolderNames(accountName: string) {
    const accountSettings = settingsStore.getAccountSettings(accountName);
    const accountFolderNames = [
      accountSettings?.folders.inbox,
      accountSettings?.folders.flagged,
      accountSettings?.folders.important,
      accountSettings?.folders.sent,
      accountSettings?.folders.drafts,
      accountSettings?.folders.archive,
      accountSettings?.folders.trash,
      accountSettings?.folders.junk,
    ];

    let names = await EmailsService.GetAccountFolderNames(accountName);
    names = _.filter(names, n => !_.includes(accountFolderNames, n))
    this.props.folderNames = _.uniq(_.concat(this.props.folderNames, names));
    this.triggerUpdate(["folderNames"]);
  }
}

const filterStore = new FilterStore();

// @ts-ignore
window.filterStore = filterStore;
export default filterStore;
