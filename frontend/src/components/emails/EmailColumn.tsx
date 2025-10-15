import _ from "lodash";
import React from "react";
import { DropTarget } from "react-dnd";

import { ALIAS_FOLDERS } from "../../constants.ts";
import { subscribe } from "../../stores/base.tsx";
import { getColumnMetaStore, getColumnStore, IColumnProps } from "../../stores/columns.ts";
import { Thread } from "../../stores/emails/base.ts";
import { getEmailStore } from "../../stores/emails/controller.ts";
import filterStore from "../../stores/filters.ts";
import settingsStore from "../../stores/settings.ts";
import { moveOrCopyThread } from "../../util/threads.js";
import EmailColumnHeader from "./EmailColumnHeader.jsx";
import EmailColumnThread from "./EmailColumnThread.tsx";

const columnTarget = {
  canDrop(props, monitor) {
    const { oldColumn } = monitor.getItem();
    return oldColumn !== props.id;
  },

  drop(props, monitor) {
    moveOrCopyThread(monitor.getItem(), props.id);
  },
};

function collect(connect, monitor) {
  return {
    connectDropTarget: connect.dropTarget(),
    isOver: monitor.isOver(),
    canDrop: monitor.canDrop(),
  };
}

interface IEmailColumnProps extends IColumnProps {
  id: string;

  hiddenThreadHashes: Set<string>;
  currentAccount: string;

  system: any;
  currentColumnGroup: string;
  columnGroups: any;

  isOver: boolean;
  canDrop: boolean;
  connectDropTarget: any;

  getPreviousColumn: () => EmailColumn;
  getNextColumn: () => EmailColumn;
}

@DropTarget("email", columnTarget, collect)
export class EmailColumn extends React.Component<IEmailColumnProps> {
  containerDiv: Element;
  emailsContainer: Element;
  lastScrollTop: number = 0;
  threadRefs: EmailColumnThread[];

  componentDidMount() {
    getEmailStore().onShowFolder(this.props.id);
  }

  componentDidUpdate(prevProps) {
    if (this.props.canDrop && !prevProps.isOver && this.props.isOver) {
      this.containerDiv.classList.add("hover");
    } else {
      this.containerDiv.classList.remove("hover");
    }
  }

  getNewEmails = () => {
    // Check if we're already syncing - note we don't subscribe the whole
    // column to the meta store to avoid unnecessary renders.
    const columnMetaStore = getColumnMetaStore(this.props.id);
    if (columnMetaStore.props.isSyncing) {
      console.debug(`Not syncing ${this.props.id} as we are already syncing!`);
      return;
    }

    getEmailStore().syncFolderEmails(this.props.id, {});
  };

  getMoreEmails = () => {
    // Check if we're already syncing - note we don't subscribe the whole
    // column to the meta store to avoid unnecessary renders.
    const columnMetaStore = getColumnMetaStore(this.props.id);
    if (columnMetaStore.props.isLoading) {
      console.debug(`Not syncing ${this.props.id} as we are already loading!`);
      return;
    }

    getEmailStore().getFolderEmails(this.props.id, {});
  };

  renderEmailThreads(threads) {
    if (!threads) {
      return (
        <div className="loader">
          <i className="fa fa-spin fa-refresh"></i>
        </div>
      );
    }

    // Build a list of our threads and references to each, such that each
    // thread can access the previous/next threads (keyboard shortcuts).
    const threadRefs: EmailColumnThread[] = [];

    const getThread = (id) => {
      const thread = threadRefs[id];

      if (thread) {
        // Thread is a wrapped by react-dnd, so get the underlying
        // EmailColumnThread instance!
        // @ts-ignore
        return thread.getDecoratedComponentInstance();
      }
    };

    const threadElements = _.map(threads, (thread, i) => {
      const getPreviousThread = () => getThread(i - 1);
      const getNextThread = () => getThread(i + 1);

      return (
        <EmailColumnThread
          key={thread.hash}
          thread={thread}
          threadRef={i}
          column={this}
          columnId={this.props.id}
          columnIsHidden={this.props.hidden}
          // Surrounding columns
          getPreviousColumn={this.props.getPreviousColumn}
          getNextColumn={this.props.getNextColumn}
          // Surrounding threads
          getPreviousThread={getPreviousThread}
          getNextThread={getNextThread}
          ref={(ref) => ref && (threadRefs[i] = ref)}
        />
      );
    });

    // Attach the refs to the column instance for keyboard controls
    this.threadRefs = threadRefs;

    return threadElements;
  }

  getFilteredEmailThreads() {
    if (!this.props.threads) {
      return this.props.threads;
    }

    const columnStore = getColumnStore(this.props.id);
    const filteredThreads = _.filter(this.props.threads, (thread) => {
      const accountKey = thread[0].accountName;

      // If this thread isn't in the selected account, ignore
      if (this.props.currentAccount && accountKey !== this.props.currentAccount) {
        return false;
      }

      // If we're an alias/main column and this thread is being shown in
      // another column, ignore.
      const currentColumns = _.filter(
        settingsStore.getCurrentColumns(),
        column => !_.includes(ALIAS_FOLDERS, column),
      );
      if (
        _.includes(ALIAS_FOLDERS, this.props.id) &&
        _.some(thread.allFolderNames, (folderName) =>
          _.includes(currentColumns, folderName)
        )
      ) {
        return false;
      }

      // If this email has been hidden (ie, is/will be moving elsewhere)
      if (columnStore.hasHiddenThread(thread)) {
        return false;
      }

      return true;
    });

    // Sort by the *first/latest* email in each thread
    return _.orderBy(
      this.props.incomingThreads.concat(filteredThreads),
      (thread) => new Date(thread[0].date),
      "desc"
    );
  }

  handleScroll = () => {
    if (!this.emailsContainer) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = this.emailsContainer;

    // Only handle if we're scrolling down
    if (scrollTop <= this.lastScrollTop) {
      this.lastScrollTop = scrollTop;
      return;
    }

    // At the bottom if we're 80% scrolled, paginate all accounts
    // TODO: scale this against total size (80% of 1M is much more than of 100)
    const allAccounts = scrollTop + clientHeight >= (scrollHeight * 0.8);

    getEmailStore().onScrollFolder(this.props.id, allAccounts);

    this.lastScrollTop = scrollTop;
  };

  render() {
    console.debug(`Render EmailColumn ${this.props.id} (hidden=${this.props.hidden})`);

    const { connectDropTarget } = this.props;
    const threads = this.getFilteredEmailThreads();

    const classNames = ["column"];
    if (this.props.hidden) {
      classNames.push("hidden")
    }
    if (this.props.open) {
      classNames.push("open");
    }

    return connectDropTarget(
      <div
        className={classNames.join(" ")}
        ref={(div) => div && (this.containerDiv = div)}
      >
        <EmailColumnHeader
          id={this.props.id}
          getNewEmails={this.getNewEmails}
          getMoreEmails={this.getMoreEmails}
        />

        <div
          className="emails"
          onScroll={_.debounce(this.handleScroll, 1000, { maxWait: 1000 })}
          ref={(ref) => ref && (this.emailsContainer = ref)}
        >
          {this.renderEmailThreads(threads)}
        </div>
      </div>
    );
  }
}

export default class EmailColumnWrapper extends EmailColumn {
  wrappedEmailColumn: any;

  getDecoratedComponentInstance() {
    return this.wrappedEmailColumn.wrappedComponent.getDecoratedComponentInstance();
  }

  render() {
    // Connect the EmailColumn to the store by passing in the path of the
    // folder we want to listen for changes on.
    const WrappedEmailColumn = subscribe(
      getColumnStore(this.props.id),
      [filterStore, ["accountName"]],
      [settingsStore, ["columns", "system", "currentAccount"]]
    )(EmailColumn);

    return (
      <WrappedEmailColumn
        {...this.props}
        {...this.state}
        // Make the original component accessible
        ref={(ref) => (this.wrappedEmailColumn = ref)}
      />
    );
  }
}
