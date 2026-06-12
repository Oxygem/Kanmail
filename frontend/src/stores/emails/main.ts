import _ from "lodash";

import { PaginateOptions } from "../../../bindings/github.com/oxygem/kanmail/internal/emails/index.ts";
import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import type { Email } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { DockService } from "../../../bindings/github.com/wailsapp/wails/v3/pkg/services/dock/index.ts";
import { INBOX } from "../../constants.ts";
import { getColumnMetaStore, getColumnStore } from "../../stores/columns.ts";
import BaseEmails from "../../stores/emails/base.js";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import { encodeFolderName, formatAddress } from "../../util/string.js";
import type { IPaginateOptions, ISyncOptions, Thread } from "./base.jsx";

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

  reduceInboxUnreadCount() {
    // Optimistic decrement no-op: badge re-syncs on next processEmailChanges.
  }

  protected onProcessedEmailChanges(folderEmails: Map<string, Thread[]>) {
    const accounts = this.getAccountKeys();
    const inboxMeta = this.meta[INBOX] || {};
    const incomplete = _.some(accounts, (accountName) => {
      const meta = inboxMeta[accountName];
      if (!meta) return true;
      const loaded = Object.keys(this.getAccountFolder(accountName, INBOX)).length;
      return loaded < meta.count;
    });

    const inboxThreads = folderEmails.get(INBOX) || [];
    const unreadCount = _.filter(inboxThreads, (t) => t.unread).length;

    const promise =
      unreadCount === 0
        ? DockService.RemoveBadge()
        : DockService.SetBadge(incomplete ? "·" : String(unreadCount));
    promise
      .then(() => console.debug("[mainEmailStore] dock badge updated", unreadCount))
      .catch((err) => console.warn("[mainEmailStore] dock badge update failed", err));
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
    const accountsToPaginate: string[] = [];
    _.each(settingsStore.props.accounts, a => {
      if (this.getMetaForAccountFolder(a.name, folderName)?.exhausted) {
        return;
      }
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

    if (accountNames) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, paginating accounts: ${accountNames}`)
      this.getFolderEmails(folderName, { accountNames })
      return;
    }

    // Respect any current account filter, then drop accounts with nothing left
    const unexhausted = _.filter(
      settingsStore.props.currentAccount
        ? [settingsStore.props.currentAccount]
        : this.getAccountKeys(),
      (accountName) => !this.getMetaForAccountFolder(accountName, folderName)?.exhausted,
    );
    if (unexhausted.length === 0) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, all accounts exhausted`)
      return;
    }

    if (allAccounts) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, paginating all accounts`)
      this.getFolderEmails(folderName, { accountNames: unexhausted });
      return;
    }

    // Not near the bottom: advance the account(s) holding back the date watermark, ie those whose
    // pagination frontier (oldest loaded email date) is the most recent. This aligns accounts by
    // date rather than count, so new batches always land below the rendered (watermark clipped)
    // threads instead of inserting above the scroll position.
    const frontierAccounts: string[] = [];
    let maxFrontier: number | null = null;
    _.each(unexhausted, (accountName) => {
      const meta = this.getMetaForAccountFolder(accountName, folderName);
      if (!meta?.lastSentDate) {
        return; // not paginated yet, initialization is onShowFolder's job
      }
      const frontier = new Date(meta.lastSentDate).getTime();
      if (maxFrontier === null || frontier > maxFrontier) {
        maxFrontier = frontier;
        frontierAccounts.length = 0;
        frontierAccounts.push(accountName);
      } else if (frontier === maxFrontier) {
        frontierAccounts.push(accountName);
      }
    });

    if (frontierAccounts.length > 0) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, paginating watermark accounts: ${frontierAccounts}`)
      this.getFolderEmails(folderName, { accountNames: frontierAccounts });
    } else {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, no accounts to paginate`)
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

      // Meta-only changes (frontier date moved, account became exhausted) shift the column date
      // watermark even when no new emails are returned, so trigger a reprocess for those too.
      const prevMeta = this.getMetaForAccountFolder(accountName, folderName);
      const metaChanged =
        !prevMeta ||
        prevMeta.exhausted !== data.meta.exhausted ||
        prevMeta.lastSentDate !== data.meta.lastSentDate;

      this.setMetaForAccountFolder(accountName, folderName, data.meta);

      let changed = false;

      if (data.emails.length > 0) {
        this.addEmailsToAccountFolder(accountName, folderName, data.emails);
        changed = true;
      }

      if (changed || metaChanged || options.forceProcess) {
        this.processEmailChanges(options);
      }
    });
  }

  // Optimistically inject a just-sent email into the sent folder, rebuild
  // threads synchronously, and return the rebuilt thread (if any) containing
  // the new message. Used so a sent quick reply appears in the open thread
  // immediately, without waiting for an IMAP sync round-trip.
  injectSentEmail(email: Email): Thread | null {
    console.debug(`[mainEmailStore] injecting email: ${email}`);

    const accountName = email.accountName;
    this.addEmailsToAccountFolder(accountName, "sent", [email]);

    // processEmailChanges is debounced; _processEmailChanges runs synchronously.
    this._processEmailChanges([[{ forceProcess: true }]]);

    const accountMessageId = `${accountName}-${email.messageId}`;
    const sentStore = getColumnStore("sent");
    const threads = sentStore.props.threads || [];
    return _.find(
      threads,
      (t) => _.some(t, (m) => m.accountMessageId === accountMessageId),
    ) || null;
  }
}

// Create the store
const mainEmailStore = new MainEmails();

// Export to JS bundle *and* the window
// @ts-ignore
window.mainEmailStore = mainEmailStore;
export default mainEmailStore;
