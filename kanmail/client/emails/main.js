import _ from 'lodash';

import requestStore from 'stores/request.js';
import settingsStore from 'stores/settings.js';
import { getColumnStore } from 'stores/columns.js';

import BaseEmails from 'emails/base.js';

import { addMessage, deleteMessage } from 'util/messages.js';


class MainEmails extends BaseEmails {
    constructor() {
        super();

        // We start with the main store active!
        this.active = true;
    }

    syncFolderEmails = (folderName, options={}) => {
        /*
            Get new emails for a folder and trigger any updates.
        */

        return this.runFolderLockedFunction(folderName, () => {
            const requests = [];

            // For each account, fetch the emails
            _.each(_.keys(settingsStore.props.accounts), accountKey => (
                requests.push(this.syncEmails(accountKey, folderName, options))
            ));

            return Promise.all(requests);
        });
    }

    syncEmails(accountKey, folderName, options={}) {
        const message = addMessage(
            `Checking for new emails in ${accountKey}/${folderName}`,
        );

        const url = `/api/emails/${accountKey}/${folderName}/sync`;
        const query = options.query || {};

        requestStore.get(url, query).then(data => {
            const columnStore = getColumnStore(folderName);

            let changed = false;

            if (data.deleted_uids.length > 0) {
                this.deleteEmailsFromAccountFolder(
                    accountKey,
                    folderName,
                    data.deleted_uids,
                );

                changed = true;
            }

            if (data.new_emails.length > 0) {
                this.addEmailsToAccountFolder(
                    accountKey,
                    folderName,
                    data.new_emails,
                );

                changed = true;
            }

            if (changed || options.forceProcess) {
                columnStore.setMeta(accountKey, data.meta);
                this.processEmailChanges();
            }

            // Update and remove the message
            deleteMessage(message);

        }).catch((e) => {
            deleteMessage(message);
            throw e; // re-raise
        });
    }

    getFolderEmails = (folderName, options={}) => {
        /*
            Get (more) emails for a given folder and trigger updates.
        */

        // return this.runFolderLockedFunction(folderName, () => {
            const requests = [];

            // For each account, fetch the emails
            _.each(_.keys(settingsStore.props.accounts), accountKey => (
                requests.push(this.getEmails(accountKey, folderName, options))
            ));

            return Promise.all(requests);
        // });
    }

    getEmails(accountKey, folderName, options={}) {
        const message = addMessage(
            `Fetching emails in ${accountKey}/${folderName}...`,
        );
        const query = options.query || {};

        return requestStore.get(
            `/api/emails/${accountKey}/${folderName}`,
            query,
        ).then(data => {
            // Attach the email meta/counts to the column immediately
            const columnStore = getColumnStore(folderName);
            columnStore.setMeta(accountKey, data.meta);

            let changed = false;

            if (data.emails.length >= 0) {
                this.addEmailsToAccountFolder(
                    accountKey,
                    folderName,
                    data.emails,
                );

                changed = true;
            }

            if (changed || options.forceProcess) {
                this.processEmailChanges();
            }

            // Update and remove the message
            deleteMessage(message);

        }).catch((e) => {
            deleteMessage(message);
            throw e; // re-raise
        });
    }
}


// Create the store
const mainEmailStore = new MainEmails();

// Export to JS bundle *and* the window
window.mainEmailStore = mainEmailStore;
export default mainEmailStore;
