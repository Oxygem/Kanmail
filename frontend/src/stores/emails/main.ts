import _ from "lodash";

import { PaginateOptions } from "../../../bindings/github.com/oxygem/kanmail/internal/emails/index.ts";
import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { INBOX } from "../../constants.ts";
import { getColumnMetaStore, getColumnStore } from "../../stores/columns.ts";
import BaseEmails from "../../stores/emails/base.js";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import { encodeFolderName, formatAddress } from "../../util/string.js";
import type { IPaginateOptions, ISyncOptions } from "./base.jsx";

export class RequestError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "Request error"
    this.statusCode = statusCode;
  }
}

class MainEmails extends BaseEmails {
  initializedFolderNames: Set<string>;

  constructor() {
    super();

    // We start with the main store active!
    this.active = true;

    // Track which folders we've initialized
    this.initializedFolderNames = new Set();
  }

  // setInboxUnreadCount() {
  //   post("/api/notifications/set-count", { count: this.unreadThreadCount });
  //   getSidebarFolderLinkStore(INBOX).setUnreadCount(this.unreadThreadCount);
  // }

  reduceInboxUnreadCount() {
    // this.unreadThreadCount -= 1;
    // this.setInboxUnreadCount();
  }

  // Called every time we re-render a column, aim is to ensure we're looking at the latest emails
  // in each account.
  onShowFolder = async (folderName: string) => {
    // If we've never seen this folder before, do a blocking reset paginate call first to initialize
    // it or reset if already initialized (devloop), then kick of a sync and exit.
    if (!this.initializedFolderNames.has(folderName)) {
      await this.getFolderEmails(folderName, {
        reset: true,
        // Always init/reset all the accounts
        accountNames: this.getAccountKeys(),
      });
      this.initializedFolderNames.add(folderName);
      await this.syncFolderEmails(folderName);
      return;
    }

    // If the previous settings included (displayed) this column, no need to update
    const prevCols = settingsStore.getPrevColumns();
    if (_.includes(prevCols, folderName)) {
      console.debug(`[mainEmailStore] onShowFolder: skip folder in prev cols: ${folderName}`)
      return;
    }

    // Sync the folder every time?
    await this.syncFolderEmails(folderName);

    // Now check if we need to paginate, and which accounts. Paginate any accounts that have less
    // than the batch side emails shown.
    // TODO: handle no more uids - or just allow backend to?
    const accountsToPaginate: string[] = [];
    _.each(settingsStore.props.accounts, a => {
      const accountFolder = this.getAccountFolder(a.name, folderName);
      if (Object.keys(accountFolder).length < settingsStore.props.system.batchSize) {
        accountsToPaginate.push(a.name);
      }
    });
    if (accountsToPaginate.length > 0) {
      await this.getFolderEmails(folderName, { accountNames: accountsToPaginate })
    }
  }

  // Called debounced as we scroll a column, aim is to ensure we keep loading more emails. Crucially
  // we also need to prevent one account clobbering the other (eg where one has many emails and the
  // other has sparse/few).
  onScrollFolder = (folderName: string, allAccounts: boolean, accountNames?: string[]) => {
    const columnMetaStore = getColumnMetaStore(folderName);
    if (columnMetaStore.props.isLoading) {
      console.debug(
        `Not loading more ${folderName} as we are already loading!`
      );
      return;
    }

    if (allAccounts) {
      console.debug(`[mainEmailStore] onsScrollFolder: ${folderName}, paginating all accounts`)
      this.getFolderEmails(folderName);
      return;
    } else if (accountNames) {
      console.debug(`[mainEmailStore] onsScrollFolder: ${folderName}, paginating accounts: ${accountNames}`)
      this.getFolderEmails(folderName, { accountNames })
      return;
    }

    // If we're not near the bottom: check for outsized accounts, paginate small ones
    const accountToSize: Map<string, number> = new Map();
    let totalCount = 0;
    _.each(settingsStore.props.accounts, a => {
      const accountFolder = this.getAccountFolder(a.name, folderName);
      const size = Object.keys(accountFolder).length;
      accountToSize.set(a.name, size);
      totalCount += size;
    });

    // Constants for account size balancing
    const SMALL_ACCOUNT_THRESHOLD = 0.5; // Accounts with less than 50% of average size are considered small

    const averageSize = totalCount / accountToSize.size;
    const smallAccounts = Array.from(accountToSize.entries())
      .filter(([_, count]) => count < averageSize * SMALL_ACCOUNT_THRESHOLD)
      .map(([accountName]) => accountName);

    // Only trigger additional loading if we have small accounts to balance
    if (smallAccounts.length > 0) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, paginating small accounts: ${smallAccounts}`, accountToSize)
      this.getFolderEmails(folderName, { accountNames: smallAccounts });
    } else {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, not bottom & accounts balanced:`, accountToSize)
    }
  }

  onAddAccount = (accountName: string) => {
    console.debug(`[mainEmailStore] onAddAccount: ${accountName}, getting all initialized folders`);
    this.initializedFolderNames.forEach(folderName => {
      this.getFolderEmails(folderName, {
        accountNames: [accountName],
      });
    });
  }

  // Get new emails for a folder and trigger any updates.
  syncFolderEmails = (folderName, options: Partial<ISyncOptions> = {}) => {
    const columnMetaStore = getColumnMetaStore(folderName);
    columnMetaStore.setSyncing(true);

    const requests: Promise<void>[] = [];

    // Calculate accounts to sync: explicit option, or current filter, or all of them
    let accountNames: string[];
    if (options.accountNames) {
      accountNames = options.accountNames
    } else if (settingsStore.props.currentAccount) {
      accountNames = [settingsStore.props.currentAccount];
    } else {
      accountNames = this.getAccountKeys();
    }

    // For each account, fetch the emails
    _.each(accountNames, (accountName) =>
      requests.push(this.syncEmails(accountName, folderName, options))
    );

    return Promise.allSettled(requests).then(resps => {
      _.each(resps, r => {
        if (r.status !== "fulfilled") {
          requestStore.addError("Failed to sync folder emails", r.reason);
        }
      });
      columnMetaStore.setSyncing(false);
    });
  };

  async syncEmails(accountName: string, folderName: string, options: Partial<ISyncOptions> = {}) {
    // const query = options.query || {}; TODO

    return requestStore.doFetchRequest(
      `Sync: ${accountName}/${folderName}`,
      EmailsService.SyncAccountFolderEmails(accountName, folderName),
    ).then(data => {
      data = data!; // TODO

      this.setMetaForAccountFolder(accountName, folderName, data.meta);

      let changed = false;

      if (data.readUids.length > 0) {
        this.setEmailsReadByUid(accountName, folderName, data.readUids);
        changed = true;
      }

      if (data.deletedUids.length > 0) {
        this.deleteEmailsFromAccountFolder(
          accountName,
          folderName,
          data.deletedUids,
        );
        changed = true;
      }

      if (data.emails.length > 0) {
        this.addEmailsToAccountFolder(
          accountName,
          folderName,
          data.emails
        );
        changed = true;

        // if (folderName == INBOX) {
        //   data.emails.map((email) => {
        //     post("/api/notifications/send", {
        //       title: email.subject,
        //       subtitle: email.from.map(formatAddress).join(", "),
        //       body: email.excerpt,
        //     });
        //   });
        // }
      }

      if (changed || options.forceProcess) {
        this.processEmailChanges(options);
      }
    });
  }

  // Get (more) emails for a given folder and trigger updates.
  getFolderEmails = (folderName, options: Partial<IPaginateOptions> = {}) => {
    if (options.batchSize === undefined) {
      options.batchSize = settingsStore.props.system.batchSize;
    }

    const columnMetaStore = getColumnMetaStore(folderName);
    columnMetaStore.setLoading(true);

    const requests: Promise<void>[] = [];

    // Calculate accounts to sync: explicit option, or current filter, or all of them
    let accountNames: string[];
    if (options.accountNames) {
      accountNames = options.accountNames
    } else if (settingsStore.props.currentAccount) {
      accountNames = [settingsStore.props.currentAccount];
    } else {
      accountNames = this.getAccountKeys();
    }

    // For each account, fetch the emails
    _.each(accountNames, (accountName) =>
      requests.push(this.getEmails(accountName, folderName, options))
    );

    return Promise.allSettled(requests).then(resps => {
      _.each(resps, r => {
        if (r.status !== "fulfilled") {
          requestStore.addError("Failed to get folder emails", r.reason);
        }
      });
      columnMetaStore.setLoading(false);
    });
  };

  async getEmails(accountName: string, folderName: string, options: Partial<IPaginateOptions> = {}) {
    const pOptions: PaginateOptions = new PaginateOptions(options);
    return requestStore.doFetchRequest(
      `Paginate ${accountName}/${folderName}`,
      EmailsService.GetAccountFolderEmails(accountName, folderName, pOptions),
    ).then(data => {
      data = data!; // TODO

      this.setMetaForAccountFolder(accountName, folderName, data.meta);

      let changed = false;

      if (data.emails.length > 0) {
        this.addEmailsToAccountFolder(accountName, folderName, data.emails);
        changed = true;
      }

      if (changed || options.forceProcess) {
        this.processEmailChanges(options);
      }
    });
  }
}

// Create the store
const mainEmailStore = new MainEmails();

// Export to JS bundle *and* the window
// @ts-ignore
window.mainEmailStore = mainEmailStore;
export default mainEmailStore;
