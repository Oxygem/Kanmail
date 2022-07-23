import _ from "lodash";

import { INBOX } from "constants.js";
import requestStore from "stores/request.js";
import { getColumnStore, getColumnMetaStore } from "stores/columns.js";
import BaseEmails from "stores/emails/base.js";
import { encodeFolderName, formatAddress } from "util/string.js";
import { post } from "util/requests.js";

class MainEmails extends BaseEmails {
  constructor() {
    super();

    // We start with the main store active!
    this.active = true;

    // Send notifications for this store's inbox
    this.sendNotifications = true;

    // Track which folders we've initialized
    this.initializedFolderNames = new Set();
  }

  initializeOrSyncFolder = (folderName, batchSize) => {
    if (this.initializedFolderNames.has(folderName)) {
      return this.syncFolderEmails(folderName);
    } else {
      this.initializedFolderNames.add(folderName);

      // Ensure the column stores are created
      getColumnStore(folderName);
      getColumnMetaStore(folderName);

      return this.getFolderEmails(folderName, {
        query: {
          reset: true,
          batch_size: batchSize,
        },
      }).then(this.syncFolderEmails(folderName));
    }
  };

  syncFolderEmails = (folderName, options = {}) => {
    /*
            Get new emails for a folder and trigger any updates.
        */

    const columnMetaStore = getColumnMetaStore(folderName);
    columnMetaStore.setSyncing(true);

    const requests = [];

    // For each account, fetch the emails
    const accountKeys = _.filter(
      this.getAccountKeys(),
      (accountKey) => !options.accountName || accountKey === options.accountName
    );
    _.each(accountKeys, (accountKey) =>
      requests.push(this.syncEmails(accountKey, folderName, options))
    );

    const finishLoading = () => columnMetaStore.setSyncing(false);
    return Promise.all(requests).then(finishLoading).catch(finishLoading);
  };

  syncEmails(accountKey, folderName, options = {}) {
    const url = `/api/emails/${accountKey}/${encodeFolderName(
      folderName
    )}/sync`;
    const query = options.query || {};

    if (!options.skipUnreadSync) {
      const uids = this.getUnreadUidsForAccountFolder(accountKey, folderName);
      query.unread_uids = uids;
    }

    return requestStore
      .get(`Sync emails in ${accountKey}/${folderName}`, url, query)
      .then((data) => {
        this.setMetaForAccountFolder(accountKey, folderName, data.meta);

        let changed = false;

        if (data.read_uids.length > 0) {
          this.setEmailsReadByUid(accountKey, folderName, data.read_uids);
          changed = true;
        }

        if (data.deleted_uids.length > 0) {
          this.deleteEmailsFromAccountFolder(
            accountKey,
            folderName,
            data.deleted_uids
          );
          changed = true;
        }

        if (data.new_emails.length > 0) {
          this.addEmailsToAccountFolder(
            accountKey,
            folderName,
            data.new_emails
          );
          changed = true;

          if (this.sendNotifications && folderName == INBOX) {
            data.new_emails.map((email) => {
              post("/api/notifications/send", {
                title: email.subject,
                subtitle: email.from.map(formatAddress).join(", "),
                body: email.excerpt,
              });
            });
          }
        }

        if (changed || options.forceProcess) {
          this.processEmailChanges();
        }
      });
  }

  getFolderEmails = (folderName, options = {}) => {
    /*
            Get (more) emails for a given folder and trigger updates.
        */

    const columnMetaStore = getColumnMetaStore(folderName);
    columnMetaStore.setLoading(true);

    const requests = [];

    // For each account, fetch the emails
    _.each(this.getAccountKeys(), (accountKey) =>
      requests.push(this.getEmails(accountKey, folderName, options))
    );

    const finishLoading = () => columnMetaStore.setLoading(false);
    return Promise.all(requests).then(finishLoading).catch(finishLoading);
  };

  getEmails(accountKey, folderName, options = {}) {
    const query = options.query || {};

    return requestStore
      .get(
        `Get emais in ${accountKey}/${folderName}`,
        `/api/emails/${accountKey}/${encodeFolderName(folderName)}`,
        query
      )
      .then((data) => {
        this.setMetaForAccountFolder(accountKey, folderName, data.meta);

        let changed = false;

        if (data.emails.length >= 0) {
          this.addEmailsToAccountFolder(accountKey, folderName, data.emails);

          changed = true;
        }

        if (changed || options.forceProcess) {
          this.processEmailChanges();
        }
      });
  }
}

// Create the store
const mainEmailStore = new MainEmails();

// Export to JS bundle *and* the window
window.mainEmailStore = mainEmailStore;
export default mainEmailStore;
