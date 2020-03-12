import _ from 'lodash';

import { BaseStore } from 'stores/base.jsx';



class ColumnMetaStore extends BaseStore {
    static storeKey = 'columnMetaStore';

    constructor(folderName) {
        super();

        this.folderName = folderName;
        this.props = {
            counts: {},

            syncCount: 0,
            loadCount: 0,

            // Controlled by the above
            isLoading: false,
            isSyncing: false,
        };
    }

    setAccountMeta(accountKey, meta) {
        this.props.counts[accountKey] = meta.count;
        // const counts = _.reduce(meta, (memo, data, accountKey) => {
        //     memo[accountKey] = data.count;
        //     return memo;
        // }, {});

        // if (!_.isEqual(this.props.counts, counts)) {
        //     this.props.counts = counts;
        this.triggerUpdate();
        // }
    }

    setSyncing(isSyncing) {
        if (isSyncing) {
            this.props.syncCount += 1;
        } else {
            this.props.syncCount -= 1;
        }

        isSyncing = this.props.syncCount > 0;

        if (this.props.isSyncing == isSyncing) {
            return;
        }

        this.props.isSyncing = isSyncing;
        this.triggerUpdate();
    }

    setLoading(isLoading) {
        if (isLoading) {
            this.props.loadCount += 1;
        } else {
            this.props.loadCount -= 1;
        }

        isLoading = this.props.loadCount > 0;

        if (this.props.isLoading == isLoading) {
            return;
        }

        this.props.isLoading = isLoading;
        this.triggerUpdate();
    }
}


class ColumnStore extends BaseStore {
    /*
        Virtual store that wraps a column component and provides updates from
        the centralised EmailStore.`
    */

    static storeKey = 'columnStore';

    constructor(folderName) {
        super();

        this.folderName = folderName;
        this.props = {
            threads: null,
        };
        this.resetCaches();
    }

    resetCaches() {
        this.props.hiddenThreadHashes = new Set();
        this.props.readThreadHashes = new Set();
    }

    readThread(thread) {
        this.props.readThreadHashes.add(thread.hash);
    }

    hideThread(thread) {
        this.props.hiddenThreadHashes.add(thread.hash);
    }

    showThread(thread) {
        this.props.hiddenThreadHashes.delete(thread.hash);
    }

    setThreads(threads, options={}) {
        let changed = false;

        // Shortcut: update if no threads or #threads changes
        if (
            options.forceUpdate
            || _.isNull(this.props.threads)
            || threads.length !== this.props.threads.length
        ) {
            changed = true;

        // Compare the two lists of threads and look for hash changes
        } else {
            _.each(threads, (thread, i) => {
                const previousThread = this.props.threads[i];

                if (
                    // Has the hash (from the *oldest* message) changed?
                    previousThread.hash !== thread.hash
                    // Or has the latest *newest* message changed
                    || previousThread[0].accountMessageId !== thread[0].accountMessageId
                    || previousThread.archived !== thread.archived
                    || previousThread.unread !== thread.unread
                    || previousThread.starred !== thread.starred
                ) {
                    changed = true;
                }
            });
        }

        if (changed) {
            this.props.threads = threads;

            if (!options.noTriggerUpdate) {
                this.triggerUpdate();
                this.resetCaches();
            }
        } else {
            console.debug(`Skipping update for ${this.folderName} as no changes detected`);
        }
    }
}


// Export the column store factory/cache
//

const columnStores = {};

export function getColumnStore(name) {
    if (!columnStores[name]) {
        console.debug(
            `Creating new column store: ${name}.`,
        );

        columnStores[name] = new ColumnStore(name);
    }

    return columnStores[name];
}

export function getColumnStoreKeys() {
    return _.keys(columnStores);
}



// Export the column meta store factory/cache
//

const columnMetaStores = {};

export function getColumnMetaStore(name) {
    if (!columnMetaStores[name]) {
        console.debug(
            `Creating new column meta store: ${name}.`,
        );

        columnMetaStores[name] = new ColumnMetaStore(name);
    }

    return columnMetaStores[name];
}

export function getColumnMetaStoreKeys() {
    return _.keys(columnStores);
}
