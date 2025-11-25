import _ from "lodash";
import ReactDOM from "react-dom";

import { Flag } from "../../../bindings/github.com/emersion/go-imap/v2/index.ts";
import { EmailRef, PaginateOptions } from "../../../bindings/github.com/oxygem/kanmail/internal/emails/index.ts";
import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import type { Email } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { ALIAS_FOLDERS } from "../../constants.ts";
import {
  getColumnMetaStore,
  getColumnStore,
  getColumnStoreKeys,
} from "../../stores/columns.ts";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import { messageThreader } from "../../threading.js";
import { debounceCollect } from "../../util/debounce.ts";

function isEmailUnread(email) {
  return !_.includes(email.flags, "\\Seen");
}

function getEmailMessageId(folderName, email) {
  // Message ID is optional in IMAP
  if (email.messageId) {
    return email.messageId;
  }

  console.warn("Email with no message ID!", email);
  return `folder-${folderName}-${email.uid}`;
}

export interface IEmail extends Email {
  hash: string;
  accountMessageId: string;
  folderUids: {
    [_: string]: number
  };
  originalReferences: string[];
}

export interface Thread extends Array<IEmail> {
  hash: string;
  archived: boolean;
  starred: boolean;
  unread: boolean;
  deleted: boolean;
  allFolderNames: string[];
  allFlags: string[];
  isIncoming: boolean;
  mergedThreads: number;
}

export function makeThread(messages: IEmail[]): Thread {
  // @ts-ignore
  const thread: Thread = _.orderBy(
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

  const allSeen: boolean[] = [];
  const allDeleted: boolean[] = [];

  let allFolderNames: string[] = [];
  let allFlags: string[] = [];

  _.each(messages, (message) => {
    allFolderNames = _.concat(allFolderNames, _.keys(message.folderUids));

    allFlags = _.concat(allFlags, message.flags);

    allSeen.push(_.includes(message.flags, Flag.FlagSeen));
    allDeleted.push(_.includes(message.flags, Flag.FlagDeleted));
  });

  allFolderNames = _.uniq(allFolderNames).sort();
  allFlags = _.uniq(allFlags);

  thread.archived = !_.includes(allFolderNames, "inbox");
  thread.starred = _.includes(allFlags, Flag.FlagFlagged);
  thread.unread = _.includes(allSeen, false);
  thread.deleted = !_.includes(allDeleted, false);

  // Also store the list of all folder names and flags for the thread
  thread.allFolderNames = allFolderNames;
  thread.allFlags = allFlags;

  return thread;
}

export interface ISyncOptions {
  forceProcess: boolean;
  accountNames: string[];
  query: string; // TODO
}

export interface IPaginateOptions extends PaginateOptions {
  reset: boolean;
  forceProcess: boolean;
  accountNames: string[];
}

// Global store that fetches and manages all emails loaded in the frontend.
// Note that this does *not* inherit from BaseStore as it should not be
// subscribed to by components - that's ColumnStore's job.
export default class BaseEmails {
  active: boolean;
  processEmailChanges: (options: Partial<ISyncOptions>) => void;
  emails: Map<string, IEmail>;
  // accountFolderUidToEmail: Map<string, Map<string, IEmail>>;
  accountFolderUidToEmail: {
    [_: string]: {
      [_: string]: IEmail,
    },
  }
  meta: Map<string, Map<string, any>>;
  referencedMessageIDs: Set<string>;

  constructor() {
    this.active = false;

    // Initialise emails/meta objects
    this.reset();

    this.processEmailChanges = debounceCollect(this._processEmailChanges, 250);
  }

  getAccountKeys() {
    return _.map(settingsStore.props.accounts, (account) => account.name);
  }

  getAccountEmails() {
    return _.reduce(
      settingsStore.props.accounts,
      (memo: string[], account) => {
        _.each(account.contacts, contact => {
          memo.push(contact.email);
        })
        return memo;
      },
      [],
    );
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

  syncFolderEmails(folderName: string, options: Partial<ISyncOptions>): Promise<void> {
    throw new Error("Not implemented!!");
  }

  getFolderEmails(folderName: string, options: Partial<IPaginateOptions>): Promise<void> {
    throw new Error("Not implemented!!");
  }

  onShowFolder(folderName: string): void {
    throw new Error("Not implemented!!");
  }

  onScrollFolder(folderName: string, allAccounts: boolean, accountNames?: string[]): void {
    throw new Error("Not implemented!!");
  }

  /*
        Generic email handling/store methods.
    */

  reset() {
    // Map of <account>-<messageId> -> email message object
    // used everywhere as a reference to a single email (not thread)
    this.emails = new Map();

    // Map of <account>-<folder> -> <uid> -> email message object
    // used in store only to translate from UID returns -> email objects
    this.accountFolderUidToEmail = {};

    // Map of folder -> account -> meta
    this.meta = new Map();

    this.referencedMessageIDs = new Set<string>();
  }

  setMetaForAccountFolder(accountKey, folderName, meta) {
    if (!this.meta[folderName]) {
      this.meta[folderName] = {};
    }

    this.meta[folderName][accountKey] = meta;
  }

  getAccountFolderKey(accountName: string, folderName: string): string {
    return `${accountName}-${folderName}`;
  }

  getAccountFolder(accountName: string, folderName: string): { [_: string]: IEmail } {
    const key = this.getAccountFolderKey(accountName, folderName);
    if (!this.accountFolderUidToEmail[key]) {
      this.accountFolderUidToEmail[key] = {};
    }
    return this.accountFolderUidToEmail[key];
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

  getUnreadUidsForAccountFolder(accountKey, folderName): string[] {
    return _.reduce(
      this.getAccountFolder(accountKey, folderName),
      (memo: string[], email, uid) => {
        if (isEmailUnread(email)) {
          memo.push(uid);
        }
        return memo;
      },
      []
    );
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
        this.emails.delete(message.accountMessageId);
      }

      this.deleteEmailFromAccountFolder(accountKey, folderName, uid);
    });
  }

  addEmailsToAccountFolder(accountKey: string, folderName: string, emails: (Email | null)[]) {
    console.debug(
      `Adding ${emails.length} emails to ${accountKey}/${folderName}`
    );

    const missingMessageIDs = new Set<string>();
    const unreferencedAccountMessageIDs = new Set<string>();
    const accountMessageIds: string[] = [];

    _.each(emails, (email: IEmail) => {
      // Get the account-unique messageID
      const accountMessageId = `${accountKey}-${getEmailMessageId(
        folderName,
        email
      )}`;
      accountMessageIds.push(accountMessageId);

      // We've already seen this email? Simply merge it's folderUids
      const existingEmail = this.emails.get(accountMessageId);
      if (existingEmail) {
        existingEmail.folderUids = _.merge(existingEmail.folderUids, {
          [folderName]: email.uid,
        });

        email = existingEmail;

        // New email - setup it's folderUids and so on
      } else {
        // email.account = accountsByName[accountKey];
        email.accountMessageId = accountMessageId;
        email.folderUids = {
          [folderName]: email.uid,
        };

        // Fix references to have account name prefixed
        email.originalReferences = email.references;
        email.references = _.map(
          email.references,
          (reference) => {
            const ref = `${accountKey}-${reference}`;

            // Track that this message ID has been referenced
            this.referencedMessageIDs.add(ref);

            // Try to find the message ID in the account if we've not got it
            if (!this.emails.has(ref)) {
              missingMessageIDs.add(reference);
            }

            return ref;
          }
        );
        // Remove from missing message IDs if was previously added
        missingMessageIDs.delete(email.messageId);
        // Add the email to the global map
        this.emails.set(accountMessageId, email);
      }

      this.setEmailForAccountFolder(accountKey, folderName, email);
    });

    // Loop each message ID processed above and find ones that have no reference
    _.each(accountMessageIds, (accountMessageId: string) => {
      if (!this.referencedMessageIDs.has(accountMessageId)) {
        unreferencedAccountMessageIDs.add(accountMessageId);
      }
    })

    // Find any missing message IDs (which will recursively call addEmailsToAccountFolder)
    if (missingMessageIDs.size > 0) {
      this.findMessageIDs(accountKey, missingMessageIDs)
    }

    // Find any messages in response to emails with no thread parent *only non-main columns*
    if (unreferencedAccountMessageIDs.size > 0 && !_.includes(ALIAS_FOLDERS, folderName)) {
      this.searchReferences(accountKey, unreferencedAccountMessageIDs);
    }
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

  handleSearchOrFindEmails(accountKey, emails: (Email | null)[]) {
    if (emails.length === 0) {
      return
    }

    const folderToEmails: { [_: string]: Email[] } = {};

    _.each(emails, (email, msgID) => {
      email = email!;
      if (!folderToEmails[email.folderName]) {
        folderToEmails[email.folderName] = [];
      }
      folderToEmails[email.folderName].push(email);
    });

    _.each(folderToEmails, (emails, folder) => {
      this.addEmailsToAccountFolder(accountKey, folder, emails)
    });

    this.processEmailChanges({});
  }

  async moveEmails(accountKey, messageUids, oldColumn, newColumn) {
    /*
            Move emails between folders but don't trigger updates.
        */

    if (oldColumn === newColumn) {
      console.debug("Not moving emails to the same folder!");
      return;
    }

    await requestStore.doPushRequest(
      `Moving ${messageUids.length} messages from \
      "${accountKey}/${oldColumn}" -> \
      "${accountKey}/${newColumn}"`,
      EmailsService.MoveAccountFolderEmails(accountKey, oldColumn, newColumn, messageUids),
    )
  };

  async copyEmails(accountKey, messageUids, oldColumn, newColumn) {
    /*
            Copy emails between folders but don't trigger updates.
        */

    if (oldColumn === newColumn) {
      console.debug("Not copying emails to the same folder!");
      return;
    }

    await requestStore.doPushRequest(
      `Copying ${messageUids.length} messages from \
      "${accountKey}/${oldColumn}" -> \
      "${accountKey}/${newColumn}"`,
      EmailsService.CopyAccountFolderEmails(accountKey, oldColumn, newColumn, messageUids),
    )
  };

  async starEmails(accountKey, folderName, messageUids) {
    /*
            Star emails in a given folder but don't trigger any updates.
        */

    await requestStore.doPushRequest(
      `Starring ${messageUids.length} messages in ${accountKey}/${folderName}`,
      EmailsService.FlagAccountFolderEmails(accountKey, folderName, messageUids),
    )

    _.each(messageUids, (uid) => {
      const email = this.getEmailFromAccountFolder(
        accountKey,
        folderName,
        uid
      );

      email.flags = _.without(email.flags, Flag.FlagFlagged);
    });
  }

  async unstarEmails(accountKey, folderName, messageUids) {
    /*
            Unstar emails in a given folder but don't trigger any updates.
        */

    await requestStore.doPushRequest(
      `Unstarring ${messageUids.length} messages in ${accountKey}/${folderName}`,
      EmailsService.UnflagAccountFolderEmails(accountKey, folderName, messageUids),
    )

    _.each(messageUids, (uid) => {
      const email = this.getEmailFromAccountFolder(
        accountKey,
        folderName,
        uid
      );

      if (!_.includes(email.flags, Flag.FlagFlagged)) {
        email.flags.push(Flag.FlagFlagged);
      }
    });
  }

  async deleteEmails(accountKey, folderName, messageUids) {
    /*
            Delete emails in a given folder but don't trigger any updates.
        */

    await requestStore.doPushRequest(
      `Deleting ${messageUids.length} messages in ${accountKey}/${folderName}`,
      EmailsService.DeleteAccountFolderEmails(accountKey, folderName, messageUids)
    );

    _.each(messageUids, (uid) => {
      const email = this.getEmailFromAccountFolder(
        accountKey,
        folderName,
        uid
      );

      if (!_.includes(email.flags, Flag.FlagDeleted)) {
        email.flags.push(Flag.FlagDeleted);
      }
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
      const email = this.emails.get(messageId);

      if (isEmailUnread(email)) {
        this.emails.get(messageId)!.flags.push(Flag.FlagSeen);
      }
    });
  }

  // TODO: process for ONE column!
  // basically: grab all emails in the column
  // for each grab all referenced
  // NO can't because threading gonna need map of all emails for ACCOUNT

  // Process BY ACCOUNT
  // filter emails by account before threading
  // modify column store setThreads to only overwrite account threads

  _processEmailChanges(opts: Partial<ISyncOptions>[][] = []) {
    /*
      Turn our single global list of emails into threads and assign to
      folders/columns, pushing updates to the relevant `ColumnStores` on
      changes.
    */

    if (opts.length > 0) {
      console.debug("Debounced process email changes", opts);
    }

    const options: Partial<ISyncOptions> = {};

    _.each(opts, opt => {
      if (opt[0].forceProcess) {
        options.forceProcess = true
      };
    })

    if (!this.active) {
      return;
    }

    const emails: IEmail[] = Array.from(this.emails.values());

    console.debug(`(re)Processing ${emails.length} emails (forceProcess=${options.forceProcess || "false"})`);

    const processStart = performance.now();

    const threader = messageThreader();

    // Make the initial ID/reference based threads
    const rootThread = threader.thread(emails);

    // Now make the subject -> thread mapping (and group by subject where
    // does not work [mising messages]).
    // TODO: make this work but not group messages w/same top-level subject
    if (settingsStore.props.system.groupThreadsBySubject) {
      threader.groupBySubject(rootThread);
    }

    // Map of folder name -> emails (list of threads)
    let folderEmails: Map<string, Thread[]> = new Map();

    _.each(rootThread.children, (messageContainer) => {
      const messages = messageContainer.flattenChildren() || [];

      if (messageContainer.message) {
        messages.push(messageContainer.message);
      }

      // Sort the thread messages by date
      const thread = makeThread(messages);

      // Push the sorted messages (the thread) into the folder/column list
      _.each(thread.allFolderNames, (folderName) => {
        if (!folderEmails.has(folderName)) {
          folderEmails.set(folderName, []);
        }

        folderEmails.get(folderName)!.push(thread);
      });
    });

    // EXPERIMENTAL!
    // Now merge single threads from the same sender
    if (settingsStore.props.system.groupSingleSenderThreads) {
      const newFolderEmails = new Map();

      folderEmails.forEach((threads: Thread[], folderName: string) => {
        const senderToSingleThread: Map<string, Thread> = new Map();
        const otherThreads: Thread[] = [];

        _.each(threads, (thread: Thread) => {
          if (thread.length > 1) {
            otherThreads.push(thread);
            return;
          }

          const accountKey = thread[0].accountName;
          const subject =
            thread[0].subject.match(/\[.*\]/) || thread[0].subject;
          const from_ = _.map(thread[0].from, (address) => address[1]);
          const threadKey = `${accountKey}-${from_}-${subject}-${thread.allFolderNames}`;
          if (!senderToSingleThread[threadKey]) {
            senderToSingleThread[threadKey] = [];
          }
          senderToSingleThread[threadKey].push(thread);
        });

        // @ts-ignore
        _.each(senderToSingleThread, (singleThreads: Thread[]) => {
          // Ensure the threads are in date-reverse order, matching other threads
          singleThreads = _.orderBy(
            singleThreads,
            (thread) => new Date(thread[0].date),
            "desc"
          );

          // We want the first thread object to be the "base" of this thread as this
          // contains all the special values we assigned above (unread, etc).
          let newThread: Thread;
          _.each(singleThreads, (singleThread) => {
            if (!newThread) {
              newThread = makeThread(_.clone(singleThread));
            } else {
              _.each(singleThread, (message) => newThread.push(message));
            }
          });

          if (singleThreads.length > 1) {
            newThread!.mergedThreads = singleThreads.length;
          }
          otherThreads.push(newThread!);
        });

        newFolderEmails.set(folderName, otherThreads);
      });

      folderEmails = newFolderEmails;
    }

    const processTaken = (performance.now() - processStart).toFixed(2);

    const renderStart = performance.now();

    ReactDOM.unstable_batchedUpdates(() => {
      _.each(getColumnStoreKeys(), (columnName) => {
        const store = getColumnStore(columnName);
        const metaStore = getColumnMetaStore(columnName);

        let threads = folderEmails.get(columnName) || [];
        // Trash is a special case - we don't actually want the entire thread but only the
        // trashed messages within. The thread still needs to exist so we can show trashed
        // messages within threads in other folders.
        if (columnName === "trash") {
          threads = _.map(threads, (thread) =>
            makeThread(
              // @ts-ignore
              _.clone(_.filter(thread, (msg) => msg.folderUids["trash"]))
            )
          );
        }

        // Always update the main column
        const forceProcess = options.forceProcess || false;

        // Push to the column and meta stores
        store.setThreads(threads, { ...options, forceProcess });
        _.each(this.meta[columnName], (meta, accountKey) =>
          metaStore.setAccountMeta(accountKey, meta)
        );
      });
    });

    const renderTaken = (performance.now() - renderStart).toFixed(2);
    console.info(
      `${emails.length} Emails processed in ${processTaken}ms and rendered in ${renderTaken}ms`
    );
  }
}
