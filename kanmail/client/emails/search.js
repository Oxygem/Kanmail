import _ from 'lodash';

import settingsStore from 'stores/settings.js';
import { getColumnStore } from 'stores/columns.js';

import BaseEmails from 'emails/base.js';

import { get } from 'util/requests.js';
import { addMessage, deleteMessage } from 'util/messages.js';


class SearchEmails extends BaseEmails {
    setSearchValue(value) {
        // Ignore if we've updated for another reason!
        if (this.searchValue === value) {
            return;
        }

        // Reset the email list if the search value has changed
        this.reset();
        this.processEmailChanges({forceUpdate: true});

        // Set the value
        this.searchValue = value;
    }

    syncFolderEmails = (folderName, options={}) => {
        // Nowt
        console.warn('Sync on search email store is a no-op!');

        return this.getFolderEmails(folderName, options);
    }

    getFolderEmails = (folderName, options={}) => {
        return this.runFolderLockedFunction(folderName, () => {
            const requests = [];

            // For each account, search for matching emails
            _.each(_.keys(settingsStore.props.accounts), accountKey => {
                requests.push(this.searchEmails(accountKey, folderName, options))
            });

            return Promise.all(requests);
        });
    }

    searchEmails(accountKey, folderName, options={}) {
        const message = addMessage(`Searching for emails matching ${this.searchValue} in ${accountKey}/${folderName}`);

        const url = `/api/emails/${accountKey}/${folderName}`;
        const query = options.query || {};
        query.query = this.searchValue;

        get(url, query).then(data => {
            const columnStore = getColumnStore(folderName);
            columnStore.setMeta(accountKey, data.meta);

            let changed = false;

            if (data.emails.length > 0) {
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


const searchEmailStore = new SearchEmails();
export default searchEmailStore;
