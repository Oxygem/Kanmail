import _ from "lodash";
import { EmailsService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { BaseStore } from "./base.tsx";

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
    const names = await EmailsService.GetAccountFolderNames(accountName);
    this.props.folderNames = _.uniq(_.concat(this.props.folderNames, names));
    this.triggerUpdate(["folderNames"]);
  }
}

const filterStore = new FilterStore();
export default filterStore;
