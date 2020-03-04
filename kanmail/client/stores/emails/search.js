import _ from 'lodash';

import requestStore from 'stores/request.js';
import { getColumnMetaStore } from 'stores/columns.js';

import BaseEmails from 'stores/emails/base.js';


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
        const columnMetaStore = getColumnMetaStore(folderName);
        columnMetaStore.setLoading(true);

        const requests = [];

        // For each account, search for matching emails
        _.each(this.getAccountKeys(), accountKey => {
            requests.push(this.searchEmails(accountKey, folderName, options))
        });

        const finishLoading = () => columnMetaStore.setLoading(false);
        return Promise.all(requests).then(finishLoading).catch(finishLoading);
    }

    searchEmails(accountKey, folderName, options={}) {
        const url = `/api/emails/${accountKey}/${folderName}`;
        const query = options.query || {};
        query.query = this.searchValue;

        requestStore.get(
            `Fetch emails from ${accountKey}/${folderName}`,
            url, query,
        ).then(data => {
            this.setMetaForAccountFolder(accountKey, folderName, data.meta);

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
        });
    }
}


const searchEmailStore = new SearchEmails();
export default searchEmailStore;
