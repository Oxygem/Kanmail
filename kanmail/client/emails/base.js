import _ from 'lodash';

import { ALIAS_FOLDERS } from 'constants.js';
import { messageThreader } from 'threading.js';

import requestStore from 'stores/request.js';
import settingsStore from 'stores/settings.js';

import { getColumnStore, getColumnStoreKeys } from 'stores/columns.js';

import { addMessage, deleteMessage } from 'util/messages.js';


export default class BaseEmails {
    /*
        Global store that fetches and manages all emails loaded in the frontend.
        Note that this does *not* inherit from BaseStore as it should not be
        subscribed to by components - that's ColumnStore's job.
    */

    constructor() {
        this.active = false;

        this.folderLocks = {};

        // Map of account/messageId -> email message object
        this.emails = {};

        // Map of acocunt/folder/uid -> email message object
        this.accountFolderUidToEmail = {};
    }

    /*
        Functions to be implemented by child classes.
    */

    syncFolderEmails() {
        throw new Error('Not implemented!!');
    }

    getFolderEmails() {
        throw new Error('Not implemented!!');
    }

    /*
        Generic email handling/store methods.
    */

    reset() {
        this.emails = {};
    }

    runFolderLockedFunction(folderName, func) {
        if (_.isUndefined(this.folderLocks[folderName])) {
            this.folderLocks[folderName] = false;
        }

        if (this.folderLocks[folderName]) {
            console.debug(
                `Not fetching emails for ${folderName} as it's locked!`,
            );
            return;
        }

        // Lock it!
        this.folderLocks[folderName] = true;

        // After the function completes, unlock and return
        return func().then(() => {
            this.folderLocks[folderName] = false;
        }).catch((e) => {
            this.folderLocks[folderName] = false;
            throw e; // re-raise
        });
    }

    addEmailsToAccountFolder(accountKey, folderName, emails) {
        console.debug(
            `Adding ${emails.length} emails to ${accountKey}/${folderName}`,
        );

        _.each(emails, email => {
            // Get the account-unique messageID
            const accountMessageId = `${accountKey}-${email.message_id}`;

            // We've already seen this email? Simply merge it's folderUids
            const existingEmail = this.emails[accountMessageId];
            if (existingEmail) {
                existingEmail.folderUids = _.merge(
                    existingEmail.folderUids,
                    {
                        [folderName]: email.uid,
                    },
                );

                email = existingEmail;

            // New email - setup it's folderUids and so on
            } else {
                email.accountMessageId = accountMessageId;
                email.folderUids = {
                    [folderName]: email.uid,
                };

                // Fix references to have account name prefixed
                email.references = _.map(email.references, reference => (
                    `${accountKey}-${reference}`
                ));

                // Add the email to the global map
                this.emails[accountMessageId] = email;
            }

            // Add map from account/folder/uid -> email object
            const accountFolderUid = (
                `${accountKey}-${folderName}-${email.folderUids[folderName]}`
            );
            this.accountFolderUidToEmail[accountFolderUid] = email;
        });
    }

    deleteEmailsFromAccountFolder(accountKey, folderName, uids) {
        console.debug(
            `Deleting ${uids.length} emails from ${accountKey}/${folderName}`,
        );

        _.each(uids, uid => {
            const message = this.getEmailFromAccountFolder(
                accountKey, folderName, uid,
            );

            // Remove any UID for this folder
            delete message.folderUids[folderName];

            // If the email is in no folders, delete from global emails
            if (_.keys(message.folderUids).length === 0) {
                delete this.emails[message.accountMessageId];
            }

            // Remove any account/folder/uid -> email reference
            const accountFolderUid = `${accountKey}-${folderName}-${uid}`;
            delete this.accountFolderUidToEmail[accountFolderUid];
        });
    }

    getEmailFromAccountFolder(accountKey, folderName, uid) {
        const accountFolderUid = `${accountKey}-${folderName}-${uid}`;
        return this.accountFolderUidToEmail[accountFolderUid];
    }

    moveEmails(accountKey, messageUids, oldColumn, newColumn) {
        /*
            Move emails between folders but don't trigger updates.
        */

        if (oldColumn === newColumn) {
            console.debug('Not moving emails to the same folder!');
            return;
        }

        console.debug(
            `Moving ${messageUids.length} messages from \
"${accountKey}/${oldColumn}" -> \
"${accountKey}/${newColumn}"`
        );

        const message = addMessage(`Moving emails to ${newColumn}`);

        // TODO: implement this as a setting (per account?)
        // Copy if we're moving FROM the inbox and NOT TO another alias folder
        const copyNotMove = (
            oldColumn == 'inbox'
            && !_.includes(ALIAS_FOLDERS, newColumn)
        );
        const action = copyNotMove ? 'copy' : 'move';

        return requestStore.post(`/api/emails/${accountKey}/${oldColumn}/${action}`, {
            message_uids: messageUids,
            new_folder: newColumn,
        }).then(() => {
            // If not copying, remove the emails from the old column
            if (!copyNotMove) {
                this.deleteEmailsFromAccountFolder(
                    accountKey, oldColumn, messageUids,
                );
            }

            deleteMessage(message);
        }).catch((e) => {
            deleteMessage(message);
            throw e; // re-raise
        });
    }

    starEmails(accountKey, folderName, messageUids) {
        /*
            Star emails in a given folder but don't trigger any updates.
        */

        console.debug(`Starring ${messageUids.length} messages in ${accountKey}/${folderName}`);

        const message = addMessage(`Starring messages in ${folderName}`);

        return requestStore.post(`/api/emails/${accountKey}/${folderName}/star`, {
            message_uids: messageUids,
        }).then(() => {
            _.each(messageUids, uid => {
                const email = this.getEmailFromAccountFolder(
                    accountKey, folderName, uid,
                );

                email.flags = _.without(email.flags, '\\Flagged');
            });

            deleteMessage(message);
        }).catch((e) => {
            deleteMessage(message);
            throw e; // re-raise
        });
    }

    unstarEmails(accountKey, folderName, messageUids) {
        /*
            Unstar emails in a given folder but don't trigger any updates.
        */

        console.debug(`Unstarring ${messageUids.length} messages in ${accountKey}/${folderName}`);

        const message = addMessage(`Unstarring messages in ${folderName}`);

        return requestStore.post(`/api/emails/${accountKey}/${folderName}/unstar`, {
            message_uids: messageUids,
        }).then(() => {
            _.each(messageUids, uid => {
                const email = this.getEmailFromAccountFolder(
                    accountKey, folderName, uid,
                );

                if (!_.includes(email.flags, '\\Flagged')) {
                    email.flags.push('\\Flagged');
                }
            });

            deleteMessage(message);
        }).catch((e) => {
            deleteMessage(message);
            throw e; // re-raise
        });
    }

    setEmailsRead(messageIds) {
        /*
            Set emails as read in the store only and don't push updates.
        */

        console.debug(`Marking ${messageIds.length} emails as read`);

        _.each(messageIds, messageId => {
            const email = this.emails[messageId];

            if (!_.includes(email.flags, '\\Seen')) {
                this.emails[messageId].flags.push('\\Seen');
            }
        });
    }

    processEmailChanges(options={}) {
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
        // threader.groupBySubject(rootThread);

        const columnFolders = settingsStore.props.columns;

        // Map of folder name -> emails (list of threads)
        const folderEmails = {};

        _.each(rootThread.children, messageContainer => {
            const messages = messageContainer.flattenChildren() || [];

            if (messageContainer.message) {
                messages.push(messageContainer.message);
            }

            // Sort the thread messages by date
            const thread = _.orderBy(messages, message => {
                const date = new Date(message.date);
                return date;
            }, 'desc');

            const allSeen = [];
            let allFolderNames = [];
            let allFlags = [];

            _.each(messages, message => {
                allFolderNames = _.concat(
                    allFolderNames,
                    _.keys(message.folderUids),
                );

                allFlags = _.concat(allFlags, message.flags);

                allSeen.push(_.includes(message.flags, '\\Seen'));
            });

            allFolderNames = _.uniq(allFolderNames);
            allFlags = _.uniq(allFlags);

            thread.archived = !_.includes(allFolderNames, 'inbox');
            thread.starred = _.includes(allFlags, '\\Flagged');
            thread.unread = _.includes(allSeen, false);

            // Also store the list of all folder names and flags for the thread
            thread.allFolderNames = allFolderNames;
            thread.allFlags = allFlags;

            // The hash becomes the key in react so must be unique per thread,
            // but also not change as new emails come in (ideally) so we don't
            // re-render the DOM element and loose the reference (for keyboard).
            // thread.hash = `${messages[0].subject}-${messages[0].date}`;
            thread.hash = messages[0].accountMessageId;

            let targetFolders;

            // If the messages is in the inbox: only show in our columns
            if (_.includes(allFolderNames, 'inbox')) {
                targetFolders = _.filter(allFolderNames, folderName => (
                    _.includes(columnFolders, folderName)
                ));
            }

            // Not in any columns? Just set everywhere
            if (_.isUndefined(targetFolders) || targetFolders.length === 0) {
                targetFolders = allFolderNames;
            }

            // Push the sorted messages (the thread) into the folder/column list
            _.each(targetFolders, folderName => {
                if (!folderEmails[folderName]) {
                    folderEmails[folderName] = [];
                }

                folderEmails[folderName].push(thread);
            });
        });

        const processTaken = (performance.now() - processStart).toFixed(2);

        const renderStart = performance.now();

        _.each(getColumnStoreKeys(), columnName => {
            const store = getColumnStore(columnName);

            let threads = folderEmails[columnName] || [];
            threads = _.orderBy(threads, emails => {
                // Sort by the *first/latest* email in each thread
                const date = new Date(emails[0].date);
                return date;
            }, 'desc');

            store.setThreads(threads, options.forceUpdate);
        });

        const renderTaken = (performance.now() - renderStart).toFixed(2);
        console.debug(`${emails.length} Emails processed in ${processTaken}ms and rendered in ${renderTaken}ms`);
    }
}
