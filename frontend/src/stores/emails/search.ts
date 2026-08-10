import _ from "lodash";

import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import type { Email } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { encodeFolderName } from "../../util/string.js";
import { getColumnMetaStore } from "../columns.js";
import BaseEmails from "../emails/base.js";
import requestStore from "../request.ts";
import settingsStore from "../settings.ts";
import { IPaginateOptions, ISyncOptions } from "./base.ts";

class SearchEmails extends BaseEmails {
  searchValue: string;
  // Bumped on every query change so in-flight requests from a superseded
  // query can be detected and dropped rather than polluting the results
  searchGeneration = 0;

  setSearchValue(value: string) {
    // Ignore if we've updated for another reason!
    if (this.searchValue === value) {
      return;
    }

    this.searchGeneration += 1;

    // Drop the previous query's emails but don't reprocess yet - the columns
    // keep the previous results rendered until the new query's results arrive
    // and rebuild them (finishLoading forces a final process), rather than
    // flashing empty in between
    this.reset();

    // Set the value
    this.searchValue = value;
  }

  syncFolderEmails = (folderName: string, options = {}) => {
    // Nowt
    console.warn("Sync on search email store is a no-op!");

    return this.getFolderEmails(folderName, options);
  };

  getFolderEmails = async (folderName: string, options: Partial<IPaginateOptions> = {}) => {
    const generation = this.searchGeneration;
    const columnMetaStore = getColumnMetaStore(folderName);
    columnMetaStore.setLoading(true);

    const requests: Promise<void>[] = [];

    // For each account, search for matching emails
    _.each(this.getAccountKeys(), (accountKey) => {
      requests.push(this.searchEmails(accountKey, folderName));
    });

    const finishLoading = () => {
      columnMetaStore.setLoading(false);
      // Force a final process so columns where the query matched nothing
      // still drop any previous query's threads
      if (generation === this.searchGeneration) {
        this.processEmailChanges({ forceProcess: true });
      }
    };
    return Promise.all(requests).then(finishLoading).catch((e) => {
      finishLoading();
      requestStore.addError("Failed to search emails", e);
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

  async searchEmails(accountID: string, folderName: string): Promise<void> {
    const generation = this.searchGeneration;

    const addResults = (emails: (Email | null)[]) => {
      if (generation !== this.searchGeneration) {
        console.debug(`[searchEmailStore] Dropping stale results for ${accountID}/${folderName}`);
        return;
      }
      if (emails.length > 0) {
        this.addEmailsToAccountFolder(accountID, folderName, emails);
        this.processEmailChanges({});
      }
    };

    // Local-first: instant results from the SQLite cache render while the
    // authoritative server search runs. Failures here are non-fatal.
    const cachedRequest = EmailsService.SearchCachedAccountFolderEmails(
      accountID, folderName, this.searchValue,
    ).then(addResults).catch((e) => requestStore.addError("Failed to search cached emails", e, { silent: true }));

    if (settingsStore.props.system.disableRemoteSearch) {
      return cachedRequest;
    }

    const emails = await requestStore.doFetchRequest(
      `Search & fetch emails from ${settingsStore.getAccountName(accountID)}/${folderName}`,
      EmailsService.SearchAccountFolderEmails(accountID, folderName, this.searchValue),
    );
    addResults(emails);

    await cachedRequest;
  }
}

const searchEmailStore = new SearchEmails();
export default searchEmailStore;
