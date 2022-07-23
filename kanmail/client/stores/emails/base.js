import _ from "lodash";
import ReactDOM from "react-dom";

import { ALIAS_FOLDERS, INBOX } from "constants.js";
import { messageThreader } from "threading.js";
import requestStore from "stores/request.js";
import settingsStore from "stores/settings.js";
import {
  getColumnStore,
  getColumnStoreKeys,
  getColumnMetaStore,
} from "stores/columns.js";
import { getSidebarFolderLinkStore } from "stores/sidebarFolderLinks.js";
import { post } from "util/requests.js";

function isEmailUnread(email) {
  return !_.includes(email.flags, "\\Seen");
}

function getEmailMessageId(folderName, email) {
  // Message ID is optional in IMAP
  if (email.message_id) {
    return email.message_id;
  }

  if (email.in_reply_to) {
    return `in_reply_to-${email.in_reply_to}`;
  }

  console.warning("Email with no message ID!");
  return `folder-${folderName}-${email.uid}`;
}

function makeThread(messages) {
  const thread = _.orderBy(
    messages,
    (message) => {
      const date = new Date(message.date);
      return date;
    },
    "desc"
  );

  // The hash becomes the key in react so must be unique per thread,
  // but also not change as new emails come in, so we use the *oldest*
  // thread message.
  thread.hash = thread[thread.length - 1].accountMessageId;

  const allSeen = [];
  const allDeleted = [];

  let allFolderNames = [];
  let allFlags = [];

  _.each(messages, (message) => {
    allFolderNames = _.concat(allFolderNames, _.keys(message.folderUids));

    allFlags = _.concat(allFlags, message.flags);

    allSeen.push(_.includes(message.flags, "\\Seen"));
    allDeleted.push(_.includes(message.flags, "\\Deleted"));
  });

  allFolderNames = _.uniq(allFolderNames).sort();
  allFlags = _.uniq(allFlags);

  thread.archived = !_.includes(allFolderNames, "inbox");
  thread.starred = _.includes(allFlags, "\\Flagged");
  thread.unread = _.includes(allSeen, false);
  thread.deleted = !_.includes(allDeleted, false);

  // Also store the list of all folder names and flags for the thread
  thread.allFolderNames = allFolderNames;
  thread.allFlags = allFlags;

  return thread;
}

export default class BaseEmails {
  /*
        Global store that fetches and manages all emails loaded in the frontend.
        Note that this does *not* inherit from BaseStore as it should not be
        subscribed to by components - that's ColumnStore's job.
    */

  constructor() {
    this.active = false;
    this.folderLocks = {};

    // Initialise emails/meta objects
    this.reset();

    this.processEmailChanges = _.debounce(this._processEmailChanges, 250, {
      maxWait: 1000,
    });
  }

  getAccountKeys() {
    return _.map(settingsStore.props.accounts, (account) => account.name);
  }

  getAccountsByName() {
    return _.reduce(
      settingsStore.props.accounts,
      (memo, account) => {
        memo[account.name] = account;
        return memo;
      },
      {}
    );
  }

  /*
        Functions to be implemented by child classes.
    */

  syncFolderEmails() {
    throw new Error("Not implemented!!");
  }

  getFolderEmails() {
    throw new Error("Not implemented!!");
  }

  /*
        Generic email handling/store methods.
    */

  reset() {
    // Map of <account>-<messageId> -> email message object
    // used everywhere as a reference to a single email (not thread)
    this.emails = {};

    // Map of <account>-<folder> -> <uid> -> email message object
    // used in store only to translate from UID returns -> email objects
    this.accountFolderUidToEmail = {};

    // Map of folder -> account -> meta
    this.meta = {};
  }

  setMetaForAccountFolder(accountKey, folderName, meta) {
    if (!this.meta[folderName]) {
      this.meta[folderName] = {};
    }

    this.meta[folderName][accountKey] = meta;
  }

  getAccountFolder(accountKey, folderName) {
    const accountFolder = `${accountKey}-${folderName}`;
    if (!this.accountFolderUidToEmail[accountFolder]) {
      this.accountFolderUidToEmail[accountFolder] = {};
    }
    return this.accountFolderUidToEmail[accountFolder];
  }

  setEmailForAccountFolder(accountKey, folderName, email) {
    this.getAccountFolder(accountKey, folderName)[
      email.folderUids[folderName]
    ] = email;
  }

  getEmailFromAccountFolder(accountKey, folderName, uid) {
    return this.getAccountFolder(accountKey, folderName)[uid];
  }

  deleteEmailFromAccountFolder(accountKey, folderName, uid) {
    const accountFolder = this.getAccountFolder(accountKey, folderName);
    delete accountFolder[uid];
  }

  getUnreadUidsForAccountFolder(accountKey, folderName) {
    return _.reduce(
      this.getAccountFolder(accountKey, folderName),
      (memo, email, uid) => {
        if (isEmailUnread(email)) {
          memo.push(uid);
        }
        return memo;
      },
      []
    );
  }

  addEmailsToAccountFolder(accountKey, folderName, emails) {
    console.debug(
      `Adding ${emails.length} emails to ${accountKey}/${folderName}`
    );

    const accountsByName = this.getAccountsByName();

    _.each(emails, (email) => {
      // Get the account-unique messageID
      const accountMessageId = `${accountKey}-${getEmailMessageId(
        folderName,
        email
      )}`;

      // We've already seen this email? Simply merge it's folderUids
      const existingEmail = this.emails[accountMessageId];
      if (existingEmail) {
        existingEmail.folderUids = _.merge(existingEmail.folderUids, {
          [folderName]: email.uid,
        });

        email = existingEmail;

        // New email - setup it's folderUids and so on
      } else {
        email.account = accountsByName[accountKey];
        email.accountMessageId = accountMessageId;
        email.folderUids = {
          [folderName]: email.uid,
        };

        // Fix references to have account name prefixed
        email.originalReferences = email.references;
        email.references = _.map(
          email.references,
          (reference) => `${accountKey}-${reference}`
        );

        // Add the email to the global map
        this.emails[accountMessageId] = email;
      }

      this.setEmailForAccountFolder(accountKey, folderName, email);
    });
  }

  deleteEmailsFromAccountFolder(accountKey, folderName, uids) {
    console.debug(
      `Deleting ${uids.length} emails from ${accountKey}/${folderName}`
    );

    _.each(uids, (uid) => {
      const message = this.getEmailFromAccountFolder(
        accountKey,
        folderName,
        uid
      );

      if (!message) {
        console.warn(
          `Email not found - already deleted?: ${accountKey}/${folderName}/${uid}!`
        );
        return;
      }

      // Remove any UID for this folder
      delete message.folderUids[folderName];

      // If the email is in no folders, delete from global emails
      if (_.keys(message.folderUids).length === 0) {
        delete this.emails[message.accountMessageId];
      }

      this.deleteEmailFromAccountFolder(accountKey, folderName, uid);
    });
  }

  moveEmails = (accountKey, messageUids, oldColumn, newColumn) => {
    /*
            Move emails between folders but don't trigger updates.
        */

    if (oldColumn === newColumn) {
      console.debug("Not moving emails to the same folder!");
      return;
    }

    console.debug(
      `Moving ${messageUids.length} messages from \
"${accountKey}/${oldColumn}" -> \
"${accountKey}/${newColumn}"`
    );

    return requestStore.post(
      `Move emails from ${oldColumn} -> ${newColumn}`,
      `/api/emails/${accountKey}/move`,
      {
        old_folder: oldColumn,
        new_folder: newColumn,
        message_uids: messageUids,
      }
    );
  };

  copyEmails = (accountKey, messageUids, oldColumn, newColumn) => {
    /*
            Copy emails between folders but don't trigger updates.
        */

    if (oldColumn === newColumn) {
      console.debug("Not copying emails to the same folder!");
      return;
    }

    console.debug(
      `Copying ${messageUids.length} messages from \
"${accountKey}/${oldColumn}" -> \
"${accountKey}/${newColumn}"`
    );

    return requestStore.post(
      `Move emails from ${oldColumn} -> ${newColumn}`,
      `/api/emails/${accountKey}/copy`,
      {
        old_folder: oldColumn,
        new_folder: newColumn,
        message_uids: messageUids,
      }
    );
  };

  starEmails(accountKey, folderName, messageUids) {
    /*
            Star emails in a given folder but don't trigger any updates.
        */

    console.debug(
      `Starring ${messageUids.length} messages in ${accountKey}/${folderName}`
    );

    return requestStore
      .post(
        `Star ${messageUids.length} emails in ${folderName}`,
        `/api/emails/${accountKey}/star`,
        {
          folder: folderName,
          message_uids: messageUids,
        }
      )
      .then(() => {
        _.each(messageUids, (uid) => {
          const email = this.getEmailFromAccountFolder(
            accountKey,
            folderName,
            uid
          );

          email.flags = _.without(email.flags, "\\Flagged");
        });
      });
  }

  unstarEmails(accountKey, folderName, messageUids) {
    /*
            Unstar emails in a given folder but don't trigger any updates.
        */

    console.debug(
      `Unstarring ${messageUids.length} messages in ${accountKey}/${folderName}`
    );

    return requestStore
      .post(
        `Unstar ${messageUids.length} emails in ${folderName}`,
        `/api/emails/${accountKey}/unstar`,
        {
          folder: folderName,
          message_uids: messageUids,
        }
      )
      .then(() => {
        _.each(messageUids, (uid) => {
          const email = this.getEmailFromAccountFolder(
            accountKey,
            folderName,
            uid
          );

          if (!_.includes(email.flags, "\\Flagged")) {
            email.flags.push("\\Flagged");
          }
        });
      });
  }

  deleteEmails(accountKey, folderName, messageUids) {
    /*
            Delete emails in a given folder but don't trigger any updates.
        */

    console.debug(
      `Deleting ${messageUids.length} messages in ${accountKey}/${folderName}`
    );

    return requestStore
      .post(
        `Delete ${messageUids.length} emails in ${folderName}`,
        `/api/emails/${accountKey}/delete`,
        {
          folder: folderName,
          message_uids: messageUids,
        }
      )
      .then(() => {
        _.each(messageUids, (uid) => {
          const email = this.getEmailFromAccountFolder(
            accountKey,
            folderName,
            uid
          );

          if (!_.includes(email.flags, "\\Deleted")) {
            email.flags.push("\\Deleted");
          }
        });
      });
  }

  setEmailsReadByUid(accountKey, folderName, messageUids) {
    const accountFolder = this.getAccountFolder(accountKey, folderName);
    const accountMessageIds = _.map(
      messageUids,
      (uid) => accountFolder[uid].accountMessageId
    );
    this.setEmailsRead(accountMessageIds);
  }

  setEmailsRead(accountMessageIds) {
    /*
            Set emails as read in the store only and don't push updates.
        */

    console.debug(`Marking ${accountMessageIds.length} emails as read`);

    _.each(accountMessageIds, (messageId) => {
      const email = this.emails[messageId];

      if (isEmailUnread(email)) {
        this.emails[messageId].flags.push("\\Seen");
      }
    });
  }

  setInboxUnreadCount() {
    post("/api/notifications/set-count", { count: this.unreadThreadCount });
    getSidebarFolderLinkStore(INBOX).setUnreadCount(this.unreadThreadCount);
  }

  reduceInboxUnreadCount() {
    this.unreadThreadCount -= 1;
    this.setInboxUnreadCount();
  }

  _processEmailChanges(options = {}) {
    /*
            Turn our single global list of emails into threads and assign to
            folders/columns, pushing updates to the relevant `ColumnStores` on
            changes.
        */

    if (!this.active) {
      return;
    }

    const emails = _.values(this.emails);

    console.debug(`(re)Processing ${emails.length} emails...`);

    const processStart = performance.now();

    const threader = messageThreader();

    // Make the initial ID/reference based threads
    const rootThread = threader.thread(emails);

    // Now make the subject -> thread mapping (and group by subject where
    // does not work [mising messages]).
    // TODO: make this work but not group messages w/same top-level subject
    if (settingsStore.props.systemSettings.group_threads_by_subject) {
      threader.groupBySubject(rootThread);
    }

    // Map of folder name -> emails (list of threads)
    let folderEmails = {};

    _.each(rootThread.children, (messageContainer) => {
      const messages = messageContainer.flattenChildren() || [];

      if (messageContainer.message) {
        messages.push(messageContainer.message);
      }

      // Sort the thread messages by date
      const thread = makeThread(messages);

      // Push the sorted messages (the thread) into the folder/column list
      _.each(thread.allFolderNames, (folderName) => {
        if (!folderEmails[folderName]) {
          folderEmails[folderName] = [];
        }

        folderEmails[folderName].push(thread);
      });
    });

    // EXPERIMENTAL!
    // Now merge single threads from the same sender
    if (settingsStore.props.systemSettings.group_single_sender_threads) {
      const newFolderEmails = {};

      _.each(folderEmails, (threads, folderName) => {
        const senderToSingleThread = {};
        const otherThreads = [];

        _.each(threads, (thread) => {
          if (thread.length > 1) {
            otherThreads.push(thread);
            return;
          }

          const accountKey = thread[0].account.name;
          const subject =
            thread[0].subject.match(/\[.*\]/) || thread[0].subject;
          const from_ = _.map(thread[0].from, (address) => address[1]);
          const threadKey = `${accountKey}-${from_}-${subject}-${thread.allFolderNames}`;
          if (!senderToSingleThread[threadKey]) {
            senderToSingleThread[threadKey] = [];
          }
          senderToSingleThread[threadKey].push(thread);
        });

        _.each(senderToSingleThread, (singleThreads) => {
          // Ensure the threads are in date-reverse order, matching other threads
          singleThreads = _.orderBy(
            singleThreads,
            (thread) => new Date(thread[0].date),
            "desc"
          );

          // We want the first thread object to be the "base" of this thread as this
          // contains all the special values we assigned above (unread, etc).
          let newThread;
          _.each(singleThreads, (singleThread) => {
            if (!newThread) {
              newThread = makeThread(_.clone(singleThread));
            } else {
              _.each(singleThread, (message) => newThread.push(message));
            }
          });

          if (singleThreads.length > 1) {
            newThread.mergedThreads = singleThreads.length;
          }
          otherThreads.push(newThread);
        });

        newFolderEmails[folderName] = otherThreads;
      });

      folderEmails = newFolderEmails;
    }

    const processTaken = (performance.now() - processStart).toFixed(2);

    const renderStart = performance.now();

    ReactDOM.unstable_batchedUpdates(() => {
      _.each(getColumnStoreKeys(), (columnName) => {
        const store = getColumnStore(columnName);
        const metaStore = getColumnMetaStore(columnName);

        let threads = folderEmails[columnName] || [];

        // Trash is a special case - we don't actually want the entire thread but only the
        // trashed messages within. The thread still needs to exist so we can show trashed
        // messages within threads in other folders.
        if (columnName === "trash") {
          threads = _.map(threads, (thread) =>
            makeThread(
              _.clone(_.filter(thread, (msg) => msg.folderUids["trash"]))
            )
          );
        }

        // Always update the main column
        const forceUpdate =
          options.forceUpdate || _.includes(ALIAS_FOLDERS, columnName);

        // Push to the column and meta stores
        store.setThreads(threads, { ...options, forceUpdate });
        _.each(this.meta[columnName], (meta, accountKey) =>
          metaStore.setAccountMeta(accountKey, meta)
        );

        if (this.sendNotifications && columnName === INBOX) {
          this.unreadThreadCount = _.filter(
            threads,
            (thread) => thread.unread
          ).length;
          this.setInboxUnreadCount();
        }
      });
    });

    const renderTaken = (performance.now() - renderStart).toFixed(2);
    console.info(
      `${emails.length} Emails processed in ${processTaken}ms and rendered in ${renderTaken}ms`
    );
  }
}
