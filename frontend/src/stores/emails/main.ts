import _ from "lodash";

import { EmailRef, PaginateOptions } from "../../../bindings/github.com/oxygem/kanmail/internal/emails/index.ts";
import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import type { Email } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { EventName } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { DockService } from "../../../bindings/github.com/wailsapp/wails/v3/pkg/services/dock/index.ts";
import { Events } from "../../../wails/runtime.js";
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
    const incomplete = _.some(accounts, (accountID) => {
      const meta = inboxMeta[accountID];
      if (!meta) return true;
      const loaded = Object.keys(this.getAccountFolder(accountID, INBOX)).length;
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
      .catch((err) => {
        console.warn("[mainEmailStore] dock badge update failed", err);
        requestStore.addError("Failed to update dock badge", err, { silent: true });
      });
  }

  async searchReferences(accountKey: string, unreferencedAccountMessageIDs: Set<string>) {
    console.debug(`Finding ${unreferencedAccountMessageIDs.size} references to messageIDs in ${accountKey}`);

    const refs: EmailRef[] = [];
    _.each(Array.from(unreferencedAccountMessageIDs), msgid => {
      const email = this.emails.get(msgid)!;
      refs.push(new EmailRef({
        reference: email.messageId,
        sentSince: email.date,
      }))
    })

    let emails: (Email | null)[]
    try {
      emails = await requestStore.doFetchRequest(
        `Search ${refs.length} references`,
        EmailsService.SearchAccountReferences(accountKey, refs),
      );
    } catch (e) {
      requestStore.addError("Failed to find references", e);
      return;
    }

    console.debug(`Found ${emails.length} emails with reference to messageIDs`);
    this.handleSearchOrFindEmails(accountKey, emails);
  }

  async findMessageIDs(accountKey: string, messageIDs: Set<string>) {
    console.debug(`Finding ${messageIDs.size} messageIDs in ${accountKey}`);

    let emails: (Email | null)[]
    try {
      emails = await requestStore.doFetchRequest(
        `Search ${messageIDs.size} message IDs`,
        EmailsService.FindAccountMessageIDs(accountKey, Array.from(messageIDs)),
      )
    } catch (e) {
      requestStore.addError("Failed to find messageIDs", e);
      return;
    }

    console.debug(`Found ${emails.length} emails with messageIDs`);
    this.handleSearchOrFindEmails(accountKey, emails);
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
        accountIDs: this.getAccountKeys(),
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
      if (this.getMetaForAccountFolder(a.id, folderName)?.exhausted) {
        return;
      }
      const accountFolder = this.getAccountFolder(a.id, folderName);
      if (Object.keys(accountFolder).length < settingsStore.props.system.batchSize) {
        accountsToPaginate.push(a.id);
      }
    });
    if (accountsToPaginate.length > 0) {
      await this.getFolderEmails(folderName, { accountIDs: accountsToPaginate })
    }
  }

  // Called debounced as we scroll a column, aim is to ensure we keep loading more emails. Crucially
  // we also need to prevent one account clobbering the other (eg where one has many emails and the
  // other has sparse/few).
  onScrollFolder = (folderName: string, allAccounts: boolean, accountIDs?: string[]) => {
    const columnMetaStore = getColumnMetaStore(folderName);
    if (columnMetaStore.props.isLoading) {
      console.debug(
        `Not loading more ${folderName} as we are already loading!`
      );
      return;
    }

    if (accountIDs) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, paginating accounts: ${accountIDs}`)
      this.getFolderEmails(folderName, { accountIDs })
      return;
    }

    // Respect any current account filter, then drop accounts with nothing left
    const unexhausted = _.filter(
      settingsStore.props.currentAccount
        ? [settingsStore.props.currentAccount]
        : this.getAccountKeys(),
      (accountID) => !this.getMetaForAccountFolder(accountID, folderName)?.exhausted,
    );
    if (unexhausted.length === 0) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, all accounts exhausted`)
      return;
    }

    if (allAccounts) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, paginating all accounts`)
      this.getFolderEmails(folderName, { accountIDs: unexhausted });
      return;
    }

    // Not near the bottom: advance the account(s) holding back the date watermark, ie those whose
    // pagination frontier (oldest loaded email date) is the most recent. This aligns accounts by
    // date rather than count, so new batches always land below the rendered (watermark clipped)
    // threads instead of inserting above the scroll position.
    const frontierAccounts: string[] = [];
    let maxFrontier: number | null = null;
    _.each(unexhausted, (accountID) => {
      const meta = this.getMetaForAccountFolder(accountID, folderName);
      if (!meta?.lastSentDate) {
        return; // not paginated yet, initialization is onShowFolder's job
      }
      const frontier = new Date(meta.lastSentDate).getTime();
      if (maxFrontier === null || frontier > maxFrontier) {
        maxFrontier = frontier;
        frontierAccounts.length = 0;
        frontierAccounts.push(accountID);
      } else if (frontier === maxFrontier) {
        frontierAccounts.push(accountID);
      }
    });

    if (frontierAccounts.length > 0) {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, paginating watermark accounts: ${frontierAccounts}`)
      this.getFolderEmails(folderName, { accountIDs: frontierAccounts });
    } else {
      console.debug(`[mainEmailStore] onScrollFolder: ${folderName}, no accounts to paginate`)
    }
  }

  onAddAccount = (accountID: string) => {
    console.debug(`[mainEmailStore] onAddAccount: ${accountID}, getting all initialized folders`);
    this.initializedFolderNames.forEach(folderName => {
      this.getFolderEmails(folderName, {
        accountIDs: [accountID],
      });
    });
  }

  // Get new emails for a folder and trigger any updates.
  syncFolderEmails = (folderName, options: Partial<ISyncOptions> = {}) => {
    const columnMetaStore = getColumnMetaStore(folderName);
    columnMetaStore.setSyncing(true);

    const requests: Promise<void>[] = [];

    // Calculate accounts to sync: explicit option, or current filter, or all of them
    let accountIDs: string[];
    if (options.accountIDs) {
      accountIDs = options.accountIDs
    } else if (settingsStore.props.currentAccount) {
      accountIDs = [settingsStore.props.currentAccount];
    } else {
      accountIDs = this.getAccountKeys();
    }

    // For each account, fetch the emails
    _.each(accountIDs, (accountID) =>
      requests.push(this.syncEmails(accountID, folderName, options))
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

  async syncEmails(accountID: string, folderName: string, options: Partial<ISyncOptions> = {}) {
    // const query = options.query || {}; TODO

    return requestStore.doFetchRequest(
      `Sync: ${settingsStore.getAccountName(accountID)}/${folderName}`,
      EmailsService.SyncAccountFolderEmails(accountID, folderName),
    ).then(data => {
      data = data!; // TODO

      this.setMetaForAccountFolder(accountID, folderName, data.meta);

      let changed = false;

      if (data.readUids.length > 0) {
        this.setEmailsReadByUid(accountID, folderName, data.readUids);
        changed = true;
      }

      if (data.deletedUids.length > 0) {
        this.deleteEmailsFromAccountFolder(
          accountID,
          folderName,
          data.deletedUids,
        );
        changed = true;
      }

      if (data.emails.length > 0) {
        this.addEmailsToAccountFolder(
          accountID,
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
    let accountIDs: string[];
    if (options.accountIDs) {
      accountIDs = options.accountIDs
    } else if (settingsStore.props.currentAccount) {
      accountIDs = [settingsStore.props.currentAccount];
    } else {
      accountIDs = this.getAccountKeys();
    }

    // For each account, fetch the emails
    _.each(accountIDs, (accountID) =>
      requests.push(this.getEmails(accountID, folderName, options))
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

  async getEmails(accountID: string, folderName: string, options: Partial<IPaginateOptions> = {}) {
    const pOptions: PaginateOptions = new PaginateOptions(options);
    return requestStore.doFetchRequest(
      `Paginate ${settingsStore.getAccountName(accountID)}/${folderName}`,
      EmailsService.GetAccountFolderEmails(accountID, folderName, pOptions),
    ).then(data => {
      data = data!; // TODO

      // Meta-only changes (frontier date moved, account became exhausted) shift the column date
      // watermark even when no new emails are returned, so trigger a reprocess for those too.
      const prevMeta = this.getMetaForAccountFolder(accountID, folderName);
      const metaChanged =
        !prevMeta ||
        prevMeta.exhausted !== data.meta.exhausted ||
        prevMeta.lastSentDate !== data.meta.lastSentDate;

      this.setMetaForAccountFolder(accountID, folderName, data.meta);

      let changed = false;

      if (data.emails.length > 0) {
        this.addEmailsToAccountFolder(accountID, folderName, data.emails);
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

    const accountID = email.accountID;
    this.addEmailsToAccountFolder(accountID, "sent", [email]);

    // processEmailChanges is debounced; _processEmailChanges runs synchronously.
    this._processEmailChanges([[{ forceProcess: true }]]);

    const accountMessageId = `${accountID}-${email.messageId}`;
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

// The backend holds an IMAP IDLE watch per displayed column and emits this when
// a folder changes server-side; sync just that account's folder in response.
Events.On(EventName.FolderSyncEvent, (ev) => {
  const { accountID, folder } = ev.data as { accountID: string; folder: string };
  console.debug(`[watcher] change in ${accountID}/${folder}, syncing`);
  mainEmailStore.syncFolderEmails(folder, { accountIDs: [accountID] });
});
