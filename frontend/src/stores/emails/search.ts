import _ from "lodash";

import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { encodeFolderName } from "../../util/string.js";
import { getColumnMetaStore } from "../columns.js";
import BaseEmails from "../emails/base.js";
import requestStore from "../request.ts";
import { trackCaughtError } from "../../util/analytics.ts";
import { IPaginateOptions, ISyncOptions } from "./base.ts";

class SearchEmails extends BaseEmails {
  searchValue: string;

  setSearchValue(value: string) {
    // Ignore if we've updated for another reason!
    if (this.searchValue === value) {
      return;
    }

    // Reset the email list if the search value has changed
    this.reset();
    this.processEmailChanges({ forceProcess: true });

    // Set the value
    this.searchValue = value;
  }

  syncFolderEmails = (folderName: string, options = {}) => {
    // Nowt
    console.warn("Sync on search email store is a no-op!");

    return this.getFolderEmails(folderName, options);
  };

  getFolderEmails = async (folderName: string, options: Partial<IPaginateOptions> = {}) => {
    const columnMetaStore = getColumnMetaStore(folderName);
    columnMetaStore.setLoading(true);

    const requests: Promise<void>[] = [];

    // For each account, search for matching emails
    _.each(this.getAccountKeys(), (accountKey) => {
      requests.push(this.searchEmails(accountKey, folderName));
    });

    const finishLoading = () => columnMetaStore.setLoading(false);
    return Promise.all(requests).then(finishLoading).catch((e) => {
      finishLoading();
      trackCaughtError("search", e);
    });
  };

  onShowFolder = (folderName: string) => {
    // Search results are driven by the active query. (Re)fetch them when a
    // column is shown, but only once we actually have something to search for -
    // toggling into search mode mounts the columns before a query exists.
    if (!this.searchValue) {
      return;
    }
    this.getFolderEmails(folderName, { reset: true });
  };

  onScrollFolder = (folderName: string) => {
    // Search returns a single fixed result set per folder - nothing to paginate.
    console.debug(`[searchEmailStore] onScrollFolder: ${folderName} is a no-op`);
  };

  async searchEmails(accountName: string, folderName: string): Promise<void> {
    const emails = await requestStore.doFetchRequest(
      `Search & fetch emails from ${accountName}/${folderName}`,
      EmailsService.SearchAccountFolderEmails(accountName, folderName, this.searchValue),
    );

    let changed = false;

    if (emails.length > 0) {
      this.addEmailsToAccountFolder(accountName, folderName, emails);
      changed = true;
    }

    if (changed) {
      this.processEmailChanges({})
    }
  }
}

const searchEmailStore = new SearchEmails();
export default searchEmailStore;
