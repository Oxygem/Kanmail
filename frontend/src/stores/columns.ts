import _ from "lodash";

import { BaseStore } from "./base.tsx";
import { ISyncOptions, Thread } from "./emails/base.ts";

interface IColumnMetaProps {
  counts: {
    [_: string]: {
      count: number
    }
  }

  syncCount: number;
  loadCount: number;

  isLoading: boolean;
  isSyncing: boolean;
}

class ColumnMetaStore extends BaseStore {
  folderName: string;
  props: IColumnMetaProps;

  constructor(folderName: string) {
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
    this.triggerUpdate();
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
    console.log("ISUPDATE", this.folderName, isLoading)
    this.triggerUpdate();
  }
}

export interface IColumnProps {
  incomingThreads: Thread[];
  threads: Thread[];

  hidden: boolean;
  open: boolean;
}

class ColumnStore extends BaseStore {
  /*
        Virtual store that wraps a column component and provides updates from
        the centralised EmailStore.`
    */

  folderName: string;
  props: IColumnProps;

  hiddenThreadHashes: Set<string>;
  readThreadHashes: Set<string>;

  constructor(folderName) {
    super();

    this.folderName = folderName;
    this.props = {
      threads: [],
      incomingThreads: [],
      hidden: false,
      open: false,
    };
    this.resetThreadSets();
  }

  hide() {
    if (!this.props.hidden) {
      this.props.hidden = true;
      this.triggerUpdate(["hidden"]);
    }
  }

  show() {
    if (this.props.hidden || this.props.open) {
      this.props.hidden = false;
      this.props.open = false;
      this.triggerUpdate(["hidden", "open"]);
    }
  }

  showAndOpen() {
    if (this.props.hidden || !this.props.open) {
      this.props.hidden = false;
      this.props.open = true;
      this.triggerUpdate(["hidden", "open"]);
    }
  }

  addIncomingThread(thread) {
    const incomingThread = _.clone(thread);
    incomingThread.isIncoming = true;
    incomingThread.hash = `incoming-${thread.hash}`;

    this.props.incomingThreads.push(incomingThread);
    this.triggerUpdate(["incomingThreads"]);
  }

  removeIncomingThread(thread) {
    const incomingHash = `incoming-${thread.hash}`;
    this.props.incomingThreads = _.filter(
      this.props.incomingThreads,
      (incomingThread) => incomingThread.hash !== incomingHash
    );
    this.triggerUpdate(["incomingThreads"]);
  }

  resetThreadSets() {
    this.hiddenThreadHashes = new Set();
    this.readThreadHashes = new Set();
  }

  readThread(thread) {
    this.readThreadHashes.add(thread.hash);
  }

  hasReadThread(thread) {
    return this.readThreadHashes.has(thread.hash);
  }

  hideThread(thread) {
    this.hiddenThreadHashes.add(thread.hash);
  }

  showThread(thread) {
    this.hiddenThreadHashes.delete(thread.hash);
  }

  hasHiddenThread(thread) {
    return this.hiddenThreadHashes.has(thread.hash);
  }

  setThreads(threads, options: Partial<ISyncOptions> = {}) {

    let changed = false;

    // Shortcut: update if no threads or #threads changes
    if (
      options.forceProcess ||
      _.isNull(this.props.threads) ||
      threads.length !== this.props.threads.length
    ) {
      changed = true;

      // Compare the two lists of threads and look for hash changes
    } else {
      _.each(threads, (thread, i) => {
        const previousThread = this.props.threads[i];

        if (
          // Has the hash (from the *oldest* message) changed?
          previousThread.hash !== thread.hash ||
          // Or has the latest *newest* message changed
          previousThread.archived !== thread.archived ||
          previousThread.unread !== thread.unread ||
          previousThread.starred !== thread.starred
        ) {
          changed = true;
        }
      });
    }

    if (changed) {
      console.debug(`Set ${threads.length} threads in column: ${this.folderName} (forceProcess=${options.forceProcess})`);
      this.props.threads = threads;
      this.triggerUpdate(["threads"]);
    }
  }
}

// Export the column store factory/cache
//

const columnStores = {};

export function getColumnStore(name) {
  if (!columnStores[name]) {
    console.debug(`Creating new column store: ${name}.`);

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
    console.debug(`Creating new column meta store: ${name}.`);

    columnMetaStores[name] = new ColumnMetaStore(name);
  }

  return columnMetaStores[name];
}

export function getColumnMetaStoreKeys() {
  return _.keys(columnMetaStores);
}
