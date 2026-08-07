import _ from "lodash";
import React from "react";
import { DragSource } from "react-dnd";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import Tooltip from "../../components/Tooltip.tsx";
import { ALIAS_FOLDERS, INBOX } from "../../constants.ts";
import keyboard from "../../keyboard.ts";
import { getColumnStore } from "../../stores/columns.ts";
import commandStore from "../../stores/command.ts";
import { Thread } from "../../stores/emails/base.ts";
import { getEmailStore } from "../../stores/emails/controller.ts";
import mainEmailStore from "../../stores/emails/main.ts";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import threadStore from "../../stores/thread.ts";
import {
  capitalizeFirstLetter,
  formatAddress,
  formatDate,
  hexToRgb,
} from "../../util/string.js";
import { buildMovePage } from "../../util/commands.tsx";
import {
  collectVisibleThreadComponents,
  getMoveDataFromThreadComponent,
  getThreadColumnMessageIds,
} from "../../util/threads.js";
import { getWelcomeBodies } from "../../stores/emails/welcome.ts";
import { EmailColumn } from "./EmailColumn.tsx";

// MediaQueryList tracks changes live, so .matches is always current
const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

/*
    Return a map of folder -> UIDs for all messages in this thread.
*/
function getThreadFolderMessageIds(thread) {
  return _.reduce(
    thread,
    (memo, message) => {
      _.each(message.folderUids, (uid, folderName) => {
        if (!memo[folderName]) {
          memo[folderName] = [];
        }

        memo[folderName].push(uid);
      });

      return memo;
    },
    {}
  );
}

const emailSource = {
  // The app-generated welcome thread lives nowhere, so there's nothing to
  // drag anywhere
  canDrag: (props) => !props.thread[0].welcome,
  beginDrag: (props, monitor, component) => {
    return getMoveDataFromThreadComponent(component);
  },
};

function collect(connect, monitor) {
  return {
    connectDragSource: connect.dragSource(),
    isDragging: monitor.isDragging(),
  };
}

interface EmailColumnThreadProps {
  thread: Thread;
  columnId: string;
  columnIsHidden: boolean;
  threadRef: number;
  column: EmailColumn;

  getPreviousColumn: () => EmailColumn | undefined;
  getNextColumn: () => EmailColumn | undefined;
  getPreviousThread: () => EmailColumnThread;
  getNextThread: () => EmailColumnThread;

  connectDragSource?: any;
}

interface EmailColumnThreadState {
  starred: boolean;
  unread: boolean;
  archived: boolean;
  deleted: boolean;
  locked: boolean;

  open?: boolean;
  hover?: boolean;
  error?: boolean;

  archiving?: boolean;
  trashing?: boolean;
  restoring?: boolean;
  moving?: boolean;
  starring?: boolean;
}

@DragSource("email", emailSource, collect)
export default class EmailColumnThread extends React.Component<
  EmailColumnThreadProps,
  EmailColumnThreadState
> {
  sendNotifications: boolean;
  element: Element | null;

  constructor(props) {
    super(props);

    const { starred, archived, deleted, isIncoming } = this.props.thread;
    let { unread } = this.props.thread;

    // Read the emails via the column store, just in case we re-render the column
    if (getColumnStore(this.props.columnId).hasReadThread(this.props.thread)) {
      unread = false;
    }

    this.sendNotifications = this.props.columnId == INBOX;

    this.state = {
      starred: starred,
      unread: unread,
      archived: archived,
      deleted: deleted,
      locked: isIncoming || false,
    };
  }

  componentDidUpdate(prevProps) {
    // If we're open and the thread changed, reopen
    if (
      this.state.open &&
      prevProps.thread.length !== this.props.thread.length
    ) {
      // Mark the emails as read in the global email store
      if (this.state.unread) {
        getEmailStore().setEmailsRead(
          _.map(
            this.props.thread,
            (message) => `${message.accountID}-${message.messageId}`
          )
        );
        if (this.sendNotifications) {
          mainEmailStore.reduceInboxUnreadCount();
        }
      }
      this.setState({
        unread: false,
      });

      threadStore.loadThread(this.props.thread);
    }

    // We want to detect when *props update*, but not state. This effectively
    // reimplements the deprecated & "unsafe" componentWillReceiveProps.
    const prevThreadProps = _.pick(prevProps.thread, [
      "starred",
      "unread",
      "archived",
    ]);
    const threadProps = _.pick(this.props.thread, [
      "starred",
      "unread",
      "archived",
    ]);
    if (_.isEqual(prevThreadProps, threadProps)) {
      return;
    }

    // If our state doesn't match the latest props, update
    const { starred, unread, archived } = this.props.thread;
    if (
      this.state.starred !== starred ||
      this.state.unread !== unread ||
      this.state.archived !== archived
    ) {
      this.setState({ unread, starred, archived });
    }
  }

  componentWillUnmount() {
    if (this.state.hover) {
      // WHY?
      // keyboard.setThreadComponent(null);
    }
  }

  setHover = (state = true) => {
    this.setState({
      hover: state,
    });
  };

  setIsMoving = () => {
    this.setState({
      moving: true,
      locked: true,
    });
  };

  undoSetIsMoving = () => {
    this.setState({
      moving: false,
      locked: false,
    });
  };

  isBusy = () => {
    return this.state.locked;
  };

  // The app-generated welcome thread renders and navigates like any other
  // thread, but exists only on this device: archive/trash dismiss it, and
  // anything that would hit the backend (star/move/reply/drag) is inert.
  isWelcome = () => {
    return !!this.props.thread[0].welcome;
  };

  dismissWelcome = () => {
    if (this.state.open) {
      threadStore.close();
    }
    // Let the collapse animation play before the settings change unmounts
    // the row
    setTimeout(() => settingsStore.setShowWelcomeEmail(false), 300);
  };

  isDeleteOnTrash() {
    if (this.props.columnId === "trash") {
      return true;
    }
    const { accountID } = this.props.thread[0];
    const accountSettings = settingsStore.getAccountSettings(accountID);
    return accountSettings ? accountSettings.settings.deleteOnTrash : false;
  }

  getThreadBackgroundColorHex(): string | undefined {
    const { thread } = this.props;
    const latestEmail = thread[0];

    // Priority 1: Global sender-specific color
    const senderEmail = latestEmail.from[0]?.email?.toLowerCase();
    const senderColors = settingsStore.props.system.senderColors;
    if (senderEmail && senderColors?.[senderEmail]) {
      return senderColors[senderEmail];
    }

    // Priority 2: Account-level color
    return settingsStore.getAccountAccentColor(latestEmail.accountID);
  }

  getThreadBackgroundColor(isHover: boolean): string | undefined {
    if (!settingsStore.props.system.theme.perSenderThreadBackgrounds) {
      return undefined;
    }

    const c = this.getThreadBackgroundColorHex();
    if (!c) {
      return undefined;
    }

    const rgb = hexToRgb(c);
    const desiredOpacity = darkModeMediaQuery.matches ? 0.2 : 0.05;
    const alwaysShow = settingsStore.props.system.theme.alwaysShowThreadBackgrounds;
    let opacity = isHover ? desiredOpacity : 0.0;
    if (alwaysShow) {
      opacity = isHover ? desiredOpacity * 2 : desiredOpacity;
    }

    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
  }

  /*
        Hover states/handling
    */
  handleMouseMove = (ev: React.MouseEvent) => {
    // Ignore mouse events fired when the DOM moves under a stationary
    // cursor — column auto-scroll, or a neighbouring thread being archived
    // causing reflow. See keyboard.isCursorStationary for the mechanism.
    if (keyboard.isCursorStationary(ev.clientX, ev.clientY)) {
      return;
    }

    if (
      this.isBusy() ||
      this.state.hover ||
      threadStore.isOpen ||
      commandStore.props.open
    ) {
      return;
    }

    keyboard.setThreadComponent(this);
  };

  handleMouseLeave = (ev: React.MouseEvent) => {
    if (keyboard.isCursorStationary(ev.clientX, ev.clientY)) {
      return;
    }

    if (this.isBusy() || threadStore.isOpen || commandStore.props.open) {
      return;
    }

    if (this.state.hover) {
      keyboard.setThreadComponent(null);
    }
  };

  /*
        User action handlers
    */
  handleClick = () => {
    if (this.state.open) {
      threadStore.close();
      return;
    }

    if (!this.state.hover) {
      keyboard.setThreadComponent(this);
    }

    // Mark the emails as read in the global email store
    // TODO: this should be done on sync response unreads?

    // if (this.state.unread) {
    //   getEmailStore().setEmailsRead(
    //     _.map(this.props.thread, (email) => email.accountMessageId)
    //   );

    //   // Read the emails via the column store, just in case we re-render the column
    //   const columnStore = getColumnStore(this.props.columnId);
    //   columnStore.readThread(this.props.thread);

    //   if (this.sendNotifications) {
    //     mainEmailStore.reduceInboxUnreadCount();
    //   }
    // }

    // Set as open (triggers highlight)
    this.setState({
      open: true,
      unread: false,
    });

    threadStore.open(
      this,
      this.props.thread,
      // On close set this thread to an unopened state
      () => {
        this.setState({
          open: false,
        });
      },
      // The welcome thread's body lives here, not in any mailbox
      this.isWelcome() ? getWelcomeBodies() : undefined,
    );
  };

  handleClickStar = (ev) => {
    ev.stopPropagation();

    if (this.isWelcome()) {
      return;
    }

    if (this.state.locked) {
      console.debug("Thread locked, not starring!");
    }

    this.setState({
      starring: true,
      locked: true,
    });

    // Only star messages from this thread in the current column/folder
    const messageUids = getThreadColumnMessageIds(
      this.props.thread,
      this.props.columnId
    );

    // Star the emails in the store - but don't sync the changes everywhere
    // instead we keep the starred state local to this component, to avoid
    // re-rendering the whole column.
    const emailStore = getEmailStore();
    let action = this.state.starred
      ? emailStore.unstarEmails
      : emailStore.starEmails;
    action = action.bind(emailStore); // fucking JavaScript

    action(
      this.props.thread[0].accountID,
      this.props.columnId,
      messageUids
    ).then(() => {
      this.setState({
        locked: false,
        starring: false,
        starred: !this.state.starred,
      });
    });
  };

  handleClickMove = (ev) => {
    ev.stopPropagation();

    if (this.isWelcome()) {
      return;
    }

    if (this.state.locked) {
      console.debug("Thread locked, not moving!");
    }

    commandStore.open(buildMovePage(this));
  };

  handleClickReply = (ev) => {
    ev.stopPropagation();

    if (this.isWelcome()) {
      return;
    }

    AppService.OpenSendWindow({
      mode: "reply",
      accountID: this.props.thread[0].accountID,
      folderName: this.props.thread[0].folderName,
      uid: this.props.thread[0].uid,
    })
  }

  handleClickReplyAll = (ev) => {
    ev.stopPropagation();

    if (this.isWelcome()) {
      return;
    }

    AppService.OpenSendWindow({
      mode: "reply-all",
      accountID: this.props.thread[0].accountID,
      folderName: this.props.thread[0].folderName,
      uid: this.props.thread[0].uid,
    })
  }

  handleClickForward = (ev) => {
    ev.stopPropagation();

    if (this.isWelcome()) {
      return;
    }

    AppService.OpenSendWindow({
      mode: "forward",
      accountID: this.props.thread[0].accountID,
      folderName: this.props.thread[0].folderName,
      uid: this.props.thread[0].uid,
    })
  }

  /*
        For every message in this thread, *any folder*, generate a move request
        to another folder.
    */
  handleThreadMessages = (name, previousState, folderFilter, handler: (any) => Promise<void>) => {
    const thread = this.props.thread;
    const accountKey = thread[0].accountID;

    const allMessageFolderUids = _.pickBy(
      getThreadFolderMessageIds(thread),
      (uids, folderName) => folderFilter === null || folderFilter(folderName)
    );

    // Hide the emails via the store, just in case we re-render the column
    const columnStore = getColumnStore(this.props.columnId);
    columnStore.hideThread(thread);

    // Selection has already moved on (selectAfterThreadAction runs before the
    // action handlers). Undo should re-select this thread unless the user has
    // deliberately navigated elsewhere since — but the collapsing row can shift
    // a flanking thread under the cursor and hover-steal (or clear) selection,
    // so treat both neighbours as "still where the action left it". Hashes,
    // not component instances, as components remount on column re-render.
    const reselectableHashes = new Set(
      _.compact([
        keyboard.currentComponent?.props.thread.hash,
        this.props.getPreviousThread()?.props.thread.hash,
        this.props.getNextThread()?.props.thread.hash,
      ]),
    );

    const undoMove = (extraState = {}) => {
      // Unhide the emails via the store, reverting above
      columnStore.showThread(thread);

      const current = keyboard.currentComponent;
      const shouldReselect = !current || reselectableHashes.has(current.props.thread.hash);

      if (this.element) {
        // If we still have an element, just update the state
        this.setState({
          ...previousState,
          ...extraState,
        });

        if (shouldReselect) {
          keyboard.selectThread(this, "nearest");
        }
      } else {
        // Failing that, re-render the column and select the remounted component
        columnStore.triggerUpdate();
        if (shouldReselect) {
          _.defer(() => {
            const restored = _.find(
              collectVisibleThreadComponents(this.props.column.threadRefs),
              (component) => component.props.thread.hash === thread.hash,
            );
            keyboard.selectThread(restored, "nearest");
          });
        }
      }
    };

    const moveThread = async () => {
      const requests = [];

      _.each(allMessageFolderUids, (uids, folderName) => {
        // @ts-ignore
        requests.push(handler({ accountKey, uids, folderName }));
      });

      return Promise.all(requests).catch((e) => {
        undoMove({ error: true });
        throw e; // re-throw for the requestStore to capture
      });
    };

    requestStore.addUndoable(name, moveThread, undoMove);

    // Top up the affected columns, letting the store pick which accounts to
    // paginate (those holding back the date watermark)
    _.each(allMessageFolderUids, (_, folderName) => {
      getEmailStore().onScrollFolder(folderName, false);
    });
  };

  moveThreadMessages = (targetFolder, previousState, folderFilter) => {
    return this.handleThreadMessages(
      `Move to ${capitalizeFirstLetter(targetFolder)}`,
      previousState,
      folderFilter,
      ({ accountKey, uids, folderName }) =>
        getEmailStore().moveEmails(accountKey, uids, folderName, targetFolder)
    );
  };

  deleteThreadMessages = (previousState) => {
    return this.handleThreadMessages(
      "Delete",
      previousState,
      null,
      ({ accountKey, uids, folderName }) =>
        getEmailStore().deleteEmails(accountKey, folderName, uids)
    );
  };

  handleClickArchive = (ev) => {
    ev.stopPropagation();

    // No double archiving please!
    if (this.state.locked) {
      console.debug("Thread locked, not archiving!");
      return;
    }

    if (this.isWelcome()) {
      this.setState({
        archiving: true,
        locked: true,
      });
      this.dismissWelcome();
      return;
    }

    if (this.sendNotifications && this.state.unread) {
      mainEmailStore.reduceInboxUnreadCount();
    }

    this.setState({
      archiving: true,
      locked: true,
    });

    const previousState = {
      archiving: false,
      locked: false,
    };

    this.moveThreadMessages(
      "archive",
      previousState,
      // Archive messages in the inbox or columns, not sent/trash/spam/drafts
      (folderName) =>
        folderName == "inbox" || !_.includes(ALIAS_FOLDERS, folderName)
    );
  };

  handleClickTrash = (ev) => {
    ev.stopPropagation();

    // No double trashing please!
    if (this.state.locked) {
      console.debug("Thread locked, not trashing!");
      return;
    }

    if (this.isWelcome()) {
      this.setState({
        trashing: true,
        locked: true,
      });
      this.dismissWelcome();
      return;
    }

    if (this.sendNotifications && this.state.unread) {
      mainEmailStore.reduceInboxUnreadCount();
    }

    this.setState({
      trashing: true,
      locked: true,
    });

    const previousState = {
      trashing: false,
      locked: false,
    };

    if (this.isDeleteOnTrash()) {
      this.deleteThreadMessages(previousState);
      return;
    }

    this.moveThreadMessages(
      "trash",
      previousState,
      // Anything already in the trash needn't be moved to trash!
      (folderName) => folderName !== "trash"
    );
  };

  handleClickRestore = (ev) => {
    ev.stopPropagation();

    if (this.props.columnId === "inbox") {
      console.debug("Thread already in inbox!");
      return;
    }

    // NEEDED?
    // if (this.state.hover) {
    //   keyboard.setThreadComponent(null);
    // }

    // No double trashing please!
    if (this.state.restoring) {
      console.debug("Thread locked, not restoring!");
      return;
    }

    this.setState({
      restoring: true,
      locked: true,
    });

    const previousState = {
      restoring: false,
      locked: false,
    };

    this.moveThreadMessages(
      "inbox",
      previousState,
      (folderName) => folderName == this.props.columnId
    );
  };

  /*
        Render
    */
  renderStarButton() {
    if (this.isWelcome() || _.includes(["trash", "spam"], this.props.columnId)) {
      return;
    }

    const classNames = ["fa"];

    if (this.state.starring) {
      classNames.push("fa-cog");
      classNames.push("fa-spin");
    } else {
      if (this.state.starred) {
        classNames.push("fa-star");
      } else {
        classNames.push("fa-star-o");
      }
    }

    const text = this.state.starred ? "Unstar" : "Star";

    return (
      <Tooltip
        text={
          <span>
            {text} (<i className="fa fa-keyboard-o" /> s)
          </span>
        }
      >
        <a
          onClick={keyboard.starCurrentThread}
          className={`star ${this.state.starred ? "active" : ""}`}
        >
          <i className={classNames.join(" ")} />
        </a>
      </Tooltip>
    );
  }

  renderMoveButton() {
    if (this.isWelcome()) {
      return;
    }

    const classNames = ["fa"];

    if (this.state.moving) {
      classNames.push("fa-cog");
      classNames.push("fa-spin");
    } else {
      classNames.push("fa-folder-open");
    }

    return (
      <Tooltip
        text={
          <span>
            Move (<i className="fa fa-keyboard-o" /> m)
          </span>
        }
      >
        <a onClick={keyboard.startMoveCurrentThread} className="move">
          <i className={classNames.join(" ")} />
        </a>
      </Tooltip>
    );
  }

  renderArchiveButton() {
    if (
      _.includes(["trash", "spam", "archive", "drafts"], this.props.columnId)
    ) {
      return;
    }

    const isWelcome = this.isWelcome();
    const classNames = ["fa"];

    if (this.state.archiving) {
      classNames.push("fa-cog");
      classNames.push("fa-spin");
    } else {
      classNames.push(isWelcome ? "fa-check" : "fa-archive");
    }

    return (
      <Tooltip
        text={
          <span>
            {isWelcome ? "Dismiss" : "Archive"} (<i className="fa fa-keyboard-o" /> enter)
          </span>
        }
      >
        {/* The welcome dismiss button is always visible, so it can be
            clicked when this thread isn't the hover-selected component -
            act on this row directly rather than via the keyboard */}
        <a
          onClick={isWelcome ? this.handleClickArchive : keyboard.archiveCurrentThread}
          className="archive"
        >
          <i className={classNames.join(" ")} />
        </a>
      </Tooltip>
    );
  }

  renderRestoreButton() {
    if (!_.includes(["trash", "spam"], this.props.columnId)) {
      return;
    }

    const classNames = ["fa"];

    if (this.state.restoring) {
      classNames.push("fa-cog");
      classNames.push("fa-spin");
    } else {
      classNames.push("fa-inbox");
    }

    return (
      <Tooltip text="Restore to inbox">
        <a onClick={this.handleClickRestore} className="archive">
          <i className={classNames.join(" ")} />
        </a>
      </Tooltip>
    );
  }

  renderTrashButton() {
    if (this.isWelcome()) {
      return;
    }

    const classNames = ["fa"];

    if (this.state.trashing) {
      classNames.push("fa-cog");
      classNames.push("fa-spin");
    } else {
      classNames.push("fa-trash");
    }

    let text = "Trash";
    if (this.isDeleteOnTrash()) {
      text = "Delete permanently";
      classNames.push("red");
    }

    return (
      <Tooltip
        text={
          <span>
            {text} (<i className="fa fa-keyboard-o" /> backspace)
          </span>
        }
      >
        <a onClick={keyboard.trashCurrentThread} className="trash">
          <i className={classNames.join(" ")} />
        </a>
      </Tooltip>
    );
  }

  renderAttachmentCount() {
    const attachmentCount = _.reduce(
      this.props.thread,
      (memo, message) => {
        const count = _.filter(message.parts, part => part.description != "").length;
        memo += count;
        return memo;
      },
      0
    );

    if (attachmentCount === 0) {
      return;
    }

    return (
      <span>
        <i className="fa fa-paperclip" /> {attachmentCount}
      </span>
    );
  }

  renderLabels() {
    const folderNames = _.filter(
      this.props.thread.allFolderNames,
      (name) => name !== this.props.columnId && !_.includes(["archive"], name)
    );

    if (folderNames.length === 0) {
      return null;
    }

    return (
      <span className="chips">
        {_.map(folderNames, (name) => (
          <span className="chip" key={name}>
            {name}
          </span>
        ))}
      </span>
    );
  }

  render() {
    if (this.props.columnIsHidden) {
      return null;
    }

    const { connectDragSource, thread } = this.props;
    const latestEmail = thread[0];

    // Show the avatar of the most recent external (non local user) email
    // const latestEmailNotUs =
    //   _.find(
    //     thread,
    //     (message) => !settingsStore.props.accountEmails.has(message.from[0][1])
    //   ) || latestEmail;
    const latestEmailNotUs = latestEmail;

    const uniqueSubjects = _.uniq(_.map(thread, (message) => message.subject));
    const subject = thread.mergedThreads
      ? uniqueSubjects.join(", ")
      : latestEmail.subject;

    const uniqueAddresses = _.uniqBy(
      _.reduce(
        this.props.thread,
        (memo: Address[], message) => {
          memo = _.concat(
            memo,
            _.map(message.from, (address) => address)
          );
          return memo;
        },
        []
      ),
      (address) => address[1]
    );

    const addresses = _.map(uniqueAddresses, (address) =>
      formatAddress(address, true)
    ).join(", ");

    const classNames = ["email"];

    _.each(["hover", "unread", "open", "error"], (key) => {
      if (this.state[key]) {
        classNames.push(key);
      }
    });

    if (this.state.archiving || this.state.trashing || this.state.moving) {
      classNames.push("archiving");
    }

    if (this.state.trashing) {
      classNames.push("trashing");
    }

    if (this.state.archived) {
      classNames.push("archived");
    }

    if (this.props.thread.isIncoming) {
      classNames.push("incoming");
    }

    const isWelcome = this.isWelcome();
    if (isWelcome) {
      classNames.push("welcome");
    }

    // Apply the custom per-sender colour via a CSS variable — the visible row
    // background is an inset, rounded ::before layer (see columns.less), not the
    // full-width box. Suppressed during the archive/trash animation.
    const backgroundColor = this.getThreadBackgroundColor(
      this.state.hover || this.state.open || false
    );
    const style = backgroundColor && !this.state.archiving && !this.state.trashing
      ? ({ "--thread-bg": backgroundColor } as React.CSSProperties)
      : undefined;

    return connectDragSource(
      <div
        className={classNames.join(" ")}
        style={style}
        onClick={this.handleClick}
        onMouseMove={this.handleMouseMove}
        onMouseLeave={this.handleMouseLeave}
        ref={(ref) => this.element = ref}
      >
        <h5 data-uid={latestEmail.uid}>
          <span className="sender">{addresses}</span>
          <span className="date">{formatDate(latestEmail.date)}</span>
        </h5>
        <h4>
          {thread.mergedThreads && (
            <Tooltip text={`${thread.mergedThreads} merged threads`}>
              <span className="multi-subject tooltip-wrapper">
                x{thread.mergedThreads}
              </span>
            </Tooltip>
          )}
          <span className="subject">
            {/*// @ts-ignore */}
            {this.state.deleted ? <strike>{subject}</strike> : subject}
          </span>
        </h4>
        <p dangerouslySetInnerHTML={{ __html: latestEmail.excerpt }}></p>
        <div className="meta">
          <span className="acct">
            <span
              className="dot"
              style={{
                background: isWelcome
                  ? "var(--brand-pink)"
                  : settingsStore.getAccountAccentColor(latestEmail.accountID) || "var(--faint)",
              }}
            />
            {isWelcome
              ? "Kanmail"
              : settingsStore.getAccountSettings(latestEmail.accountID)?.name || latestEmail.accountID}
          </span>
          {this.renderLabels()}
          <span className="buttons">
            {this.renderStarButton()}
            {this.renderMoveButton()}
            {this.renderArchiveButton()}
            {this.renderRestoreButton()}
            {this.renderTrashButton()}
          </span>
          <span className="extra-meta">
            {this.state.starred && (
              <a className="star active">
                <i className="fa fa-star" />
              </a>
            )}
            {thread.length > 1 && (
              <span>
                <i className="fa fa-envelope-o" /> {thread.length}
              </span>
            )}
            {uniqueAddresses.length > 1 && (
              <span>
                <i className="fa fa-user-o" /> {uniqueAddresses.length}
              </span>
            )}
            {this.renderAttachmentCount()}
          </span>
        </div>
      </div>
    );
  }
}
