import _ from 'lodash';

import requestStore from 'stores/request.js';
import settingsStore from 'stores/settings.js';
import { getColumnMetaStore } from 'stores/columns.js';

import BaseEmails from 'emails/base.js';


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

        const columnMetaStore = getColumnMetaStore(folderName);
        columnMetaStore.setSyncing(true);

        const requests = [];

        // For each account, fetch the emails
        _.each(_.keys(settingsStore.props.accounts), accountKey => (
            requests.push(this.syncEmails(accountKey, folderName, options))
        ));

        const finishLoading = () => {
            if (this.active) {
                columnMetaStore.setSyncing(false);
            }
        }
        return Promise.all(requests).then(finishLoading).catch(finishLoading);
    }

    syncEmails(accountKey, folderName, options={}) {
        const url = `/api/emails/${accountKey}/${folderName}/sync`;
        const query = options.query || {};

        return requestStore.get(
            `Sync emails in ${accountKey}/${folderName}`,
            url, query,
        ).then(data => {
            this.setMetaForAccountFolder(accountKey, folderName, data.meta);

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
                this.processEmailChanges();
            }
        });
    }

    getFolderEmails = (folderName, options={}) => {
        /*
            Get (more) emails for a given folder and trigger updates.
        */

        const columnMetaStore = getColumnMetaStore(folderName);
        columnMetaStore.setLoading(true);

        const requests = [];

        // For each account, fetch the emails
        _.each(_.keys(settingsStore.props.accounts), accountKey => (
            requests.push(this.getEmails(accountKey, folderName, options))
        ));

        const finishLoading = () => {
            if (this.active) {
                columnMetaStore.setLoading(false);
            }
        }
        return Promise.all(requests).then(finishLoading).catch(finishLoading);
    }

    getEmails(accountKey, folderName, options={}) {
        const query = options.query || {};

        return requestStore.get(
            `Get emais in ${accountKey}/${folderName}`,
            `/api/emails/${accountKey}/${folderName}`,
            query,
        ).then(data => {
            this.setMetaForAccountFolder(accountKey, folderName, data.meta);

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
        });
    }
}


// Create the store
const mainEmailStore = new MainEmails();

// Export to JS bundle *and* the window
window.mainEmailStore = mainEmailStore;
export default mainEmailStore;
