import _ from "lodash";
import React from "react";
import { DropTarget } from "react-dnd";

import { ALIAS_FOLDERS, INBOX } from "../../constants.ts";
import { subscribe } from "../../stores/base.tsx";
import { getColumnMetaStore, getColumnStore, IColumnProps } from "../../stores/columns.ts";
import { Thread } from "../../stores/emails/base.ts";
import { getEmailStore } from "../../stores/emails/controller.ts";
import filterStore from "../../stores/filters.ts";
import settingsStore from "../../stores/settings.ts";
import { moveOrCopyThread } from "../../util/threads.js";
import { getWelcomeThread } from "../../stores/emails/welcome.ts";
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
  index: number;

  currentAccount: string;

  system: any;

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
    // Columns are keyed by index, so the same instance can switch folder
    if (prevProps.id !== this.props.id) {
      getEmailStore().onShowFolder(this.props.id);
    }

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

    // If we're an alias/main column, threads shown in another column are
    // ignored. We check columns across *all* workflows, not just the current
    // one, so a thread filed into a column that belongs to another workflow
    // (eg via copy-from-inbox) doesn't reappear in the inbox.
    const isAliasColumn = _.includes(ALIAS_FOLDERS, this.props.id);
    const otherColumns = isAliasColumn
      ? _.filter(
          settingsStore.getAllColumns(),
          column => !_.includes(ALIAS_FOLDERS, column),
        )
      : [];

    const filteredThreads = _.filter(this.props.threads, (thread) => {
      const accountKey = thread[0].accountID;

      // If this thread isn't in the selected account, ignore
      if (this.props.currentAccount && accountKey !== this.props.currentAccount) {
        return false;
      }

      if (
        isAliasColumn &&
        _.some(thread.allFolderNames, (folderName) =>
          _.includes(otherColumns, folderName)
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
    const threads = _.orderBy(
      this.props.incomingThreads.concat(filteredThreads),
      (thread) => new Date(thread[0].date),
      "desc"
    );

    // The welcome thread is pinned above everything else in the inbox,
    // rendering (and keyboard navigating) like any other thread
    if (this.props.id === INBOX && settingsStore.props.system.showWelcomeEmail) {
      threads.unshift(getWelcomeThread());
    }

    return threads;
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

  // Reveal this column's scrollbar while it's actively scrolling (macOS-style),
  // then hide it shortly after scrolling stops. Toggled as a DOM class so it
  // doesn't re-render the column, and so each column reveals independently.
  private hideScrollbarTimer: ReturnType<typeof setTimeout> | null = null;
  private debouncedHandleScroll = _.debounce(() => this.handleScroll(), 1000, { maxWait: 1000 });

  handleScrollEvent = () => {
    if (this.emailsContainer) {
      this.emailsContainer.classList.add("scrolling");
      if (this.hideScrollbarTimer) {
        clearTimeout(this.hideScrollbarTimer);
      }
      this.hideScrollbarTimer = setTimeout(() => {
        this.emailsContainer && this.emailsContainer.classList.remove("scrolling");
      }, 900);
    }
    this.debouncedHandleScroll();
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
          index={this.props.index}
          getNewEmails={this.getNewEmails}
          getMoreEmails={this.getMoreEmails}
        />

        <div
          className="emails"
          onScroll={this.handleScrollEvent}
          ref={(ref) => ref && (this.emailsContainer = ref)}
        >
          {this.renderEmailThreads(threads)}
        </div>
      </div>
    );
  }
}

// Cache of wrapped email columns to avoid subscribe() inside render()
const wrappedEmailColumns: Record<string, any> = {};

function getWrappedEmailColumn(id: string) {
  if (!wrappedEmailColumns[id]) {
    // Connect the EmailColumn to the store by passing in the path of the
    // folder we want to listen for changes on.
    wrappedEmailColumns[id] = subscribe(
      getColumnStore(id),
      [filterStore, ["accountID"]],
      [settingsStore, ["columns", "system", "currentAccount"]]
    )(EmailColumn);
  }
  return wrappedEmailColumns[id];
}

export default class EmailColumnWrapper extends EmailColumn {
  wrappedEmailColumn: any;

  getDecoratedComponentInstance() {
    return this.wrappedEmailColumn.wrappedComponent.getDecoratedComponentInstance();
  }

  render() {
    const WrappedEmailColumn = getWrappedEmailColumn(this.props.id);
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
