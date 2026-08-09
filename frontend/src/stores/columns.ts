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

  setAccountMeta(accountKey: string, meta: { count: number }) {
    this.props.counts[accountKey] = meta;
    this.triggerUpdate();
  }

  setSyncing(isSyncing: boolean) {
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

  setLoading(isLoading: boolean) {
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

  // Threads pending a move/delete are hidden by their messages' IDs, not the
  // thread hash - re-threading (merges, older messages syncing in) can change
  // a thread's hash mid-undo, which would un-hide it if keyed by hash.
  hiddenMessageIds: Set<string>;
  readThreadHashes: Set<string>;

  // folderUidsVersion of each message at the time threads were set, keyed by
  // accountMessageId. Messages are mutated in place (single in-memory copy shared
  // with the previous thread list) so we cannot compare live folderUids against
  // previousThread[j].folderUids - they are the same object. Compare versions instead.
  folderUidsSnapshot: { [_: string]: number };

  constructor(folderName: string) {
    super();

    this.hiddenMessageIds = new Set();
    this.readThreadHashes = new Set();
    this.folderUidsSnapshot = {};

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

  addIncomingThread(thread: Thread) {
    const incomingThread = _.clone(thread);
    incomingThread.isIncoming = true;
    incomingThread.hash = `incoming-${thread.hash}`;

    this.props.incomingThreads.push(incomingThread);
    this.triggerUpdate(["incomingThreads"]);
  }

  removeIncomingThread(thread: Thread) {
    const incomingHash = `incoming-${thread.hash}`;
    this.props.incomingThreads = _.filter(
      this.props.incomingThreads,
      (incomingThread) => incomingThread.hash !== incomingHash
    );
    this.triggerUpdate(["incomingThreads"]);
  }

  resetThreadSets() {
    this.hiddenMessageIds = new Set();
    this.readThreadHashes = new Set();
  }

  readThread(thread: Thread) {
    this.readThreadHashes.add(thread.hash);
  }

  hasReadThread(thread: Thread) {
    return this.readThreadHashes.has(thread.hash);
  }

  hideThread(thread: Thread) {
    _.each(thread, (message) =>
      this.hiddenMessageIds.add(message.accountMessageId)
    );
  }

  showThread(thread: Thread) {
    _.each(thread, (message) =>
      this.hiddenMessageIds.delete(message.accountMessageId)
    );
  }

  hasHiddenThread(thread: Thread) {
    return _.some(thread, (message) =>
      this.hiddenMessageIds.has(message.accountMessageId)
    );
  }

  setThreads(threads: Thread[], options: Partial<ISyncOptions> = {}) {
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
          previousThread.length !== thread.length ||
          previousThread.hash !== thread.hash ||
          previousThread.archived !== thread.archived ||
          previousThread.unread !== thread.unread ||
          previousThread.starred !== thread.starred ||
          previousThread.deleted !== thread.deleted ||
          // Compare each message's live folderUidsVersion against the snapshot taken
          // at the last set, not previousThread[j] which is the same mutated object.
          _.some(
            thread,
            (message) =>
              message.folderUidsVersion !==
              this.folderUidsSnapshot[message.accountMessageId]
          )
        ) {
          changed = true;
        }
      });
    }

    if (changed) {
      console.debug(`Set ${threads.length} threads in column: ${this.folderName} (forceProcess=${options.forceProcess})`);
      this.props.threads = threads;

      this.folderUidsSnapshot = {};
      _.each(threads, (thread) => {
        _.each(thread, (message) => {
          this.folderUidsSnapshot[message.accountMessageId] =
            message.folderUidsVersion;
        });
      });

      this.hiddenMessageIds.forEach((messageId) => {
        if (!(messageId in this.folderUidsSnapshot)) {
          this.hiddenMessageIds.delete(messageId);
        }
      });

      this.triggerUpdate(["threads"]);
    } else {
      console.debug(`Skip set unchanged threads in column: ${this.folderName}`);
    }
  }
}

// Export the column store factory/cache
//

const columnStores: { [_: string]: ColumnStore } = {};

export function getColumnStore(name: string) {
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

const columnMetaStores: { [_: string]: ColumnMetaStore } = {};

export function getColumnMetaStore(name: string) {
  if (!columnMetaStores[name]) {
    console.debug(`Creating new column meta store: ${name}.`);

    columnMetaStores[name] = new ColumnMetaStore(name);
  }

  return columnMetaStores[name];
}

export function getColumnMetaStoreKeys() {
  return _.keys(columnMetaStores);
}
