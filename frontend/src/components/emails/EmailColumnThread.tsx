import _ from "lodash";
import React from "react";
import { DragSource } from "react-dnd";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import Avatar from "../../components/Avatar.jsx";
import Tooltip from "../../components/Tooltip.tsx";
import { ALIAS_FOLDERS, INBOX } from "../../constants.ts";
import keyboard from "../../keyboard.ts";
import { getColumnStore } from "../../stores/columns.ts";
import controlStore from "../../stores/control.js";
import { Thread } from "../../stores/emails/base.ts";
import { getEmailStore } from "../../stores/emails/controller.ts";
import mainEmailStore from "../../stores/emails/main.ts";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import threadStore from "../../stores/thread.ts";
import { getAccountIconName } from "../../util/accounts.js";
import {
  formatAddress,
  formatDate,
  hexToRgb,
} from "../../util/string.js";
import {
  buildMoveFolderOptions,
  getMoveDataFromThreadComponent,
  getThreadColumnMessageIds,
  moveOrCopyThread,
} from "../../util/threads.js";
import { EmailColumn } from "./EmailColumn.tsx";

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

  getPreviousColumn: () => EmailColumn;
  getNextColumn: () => EmailColumn;
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
            (message) => `${message.accountName}-${message.messageId}`
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

  isDeleteOnTrash() {
    if (this.props.columnId === "trash") {
      return true;
    }
    const { accountName } = this.props.thread[0];
    const accountSettings = settingsStore.getAccountSettings(accountName);
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
    return settingsStore.getAccountAccentColor(latestEmail.accountName);
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
    const desiredOpacity = window.matchMedia("(prefers-color-scheme: dark)").matches ? 0.2 : 0.05;
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
      controlStore.props.open
    ) {
      return;
    }

    keyboard.setThreadComponent(this);
  };

  handleMouseLeave = (ev: React.MouseEvent) => {
    if (keyboard.isCursorStationary(ev.clientX, ev.clientY)) {
      return;
    }

    if (this.isBusy() || threadStore.isOpen || controlStore.props.open) {
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
      }
    );
  };

  handleClickStar = (ev) => {
    ev.stopPropagation();

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
      this.props.thread[0].accountName,
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

    if (this.state.locked) {
      console.debug("Thread locked, not moving!");
    }

    const subject = this.props.thread[0].subject;
    const moveData = getMoveDataFromThreadComponent(this);

    // TODO: what's this for? remove...
    // controlStore.open("move", subject, moveData);

    const controlInputHandler = (value) => {
      if (!value) {
        return;
      }

      moveOrCopyThread(moveData, value.value, keyboard.setMovingCurrentThread);
    };

    controlStore.open(controlInputHandler, {
      selectOptions: buildMoveFolderOptions(this.props.columnId),
      header: (
        <span>
          Move <strong>{subject}</strong>...
        </span>
      ),
    });
  };

  handleClickReply = (ev) => {
    ev.stopPropagation();

    AppService.OpenSendWindow({
      mode: "reply",
      accountName: this.props.thread[0].accountName,
      folderName: this.props.thread[0].folderName,
      uid: this.props.thread[0].uid,
    })
  }

  handleClickReplyAll = (ev) => {
    ev.stopPropagation();

    AppService.OpenSendWindow({
      mode: "reply-all",
      accountName: this.props.thread[0].accountName,
      folderName: this.props.thread[0].folderName,
      uid: this.props.thread[0].uid,
    })
  }

  handleClickForward = (ev) => {
    ev.stopPropagation();

    AppService.OpenSendWindow({
      mode: "forward",
      accountName: this.props.thread[0].accountName,
      folderName: this.props.thread[0].folderName,
      uid: this.props.thread[0].uid,
    })
  }

  /*
        For every message in this thread, *any folder*, generate a move request
        to another folder.
    */
  handleThreadMessages = (previousState, folderFilter, handler: (any) => Promise<void>) => {
    const thread = this.props.thread;
    const accountKey = thread[0].accountName;

    const allMessageFolderUids = _.pickBy(
      getThreadFolderMessageIds(thread),
      (uids, folderName) => folderFilter === null || folderFilter(folderName)
    );

    // Hide the emails via the store, just in case we re-render the column
    const columnStore = getColumnStore(this.props.columnId);
    columnStore.hideThread(thread);

    const undoMove = (extraState = {}) => {
      // Unhide the emails via the store, reverting above
      columnStore.showThread(thread);

      if (this.element) {
        // If we still have an element, just update the state
        this.setState({
          ...previousState,
          ...extraState,
        });
      } else {
        // Failing that, re-render the column
        columnStore.triggerUpdate();
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

    requestStore.addUndoable(moveThread, undoMove);

    // Top up the affected columns, letting the store pick which accounts to
    // paginate (those holding back the date watermark)
    _.each(allMessageFolderUids, (_, folderName) => {
      getEmailStore().onScrollFolder(folderName, false);
    });
  };

  moveThreadMessages = (targetFolder, previousState, folderFilter) => {
    return this.handleThreadMessages(
      previousState,
      folderFilter,
      ({ accountKey, uids, folderName }) =>
        getEmailStore().moveEmails(accountKey, uids, folderName, targetFolder)
    );
  };

  deleteThreadMessages = (previousState) => {
    return this.handleThreadMessages(
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
    if (_.includes(["trash", "spam"], this.props.columnId)) {
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

    const classNames = ["fa"];

    if (this.state.archiving) {
      classNames.push("fa-cog");
      classNames.push("fa-spin");
    } else {
      classNames.push("fa-archive");
    }

    return (
      <Tooltip
        text={
          <span>
            Archive (<i className="fa fa-keyboard-o" /> enter)
          </span>
        }
      >
        <a onClick={keyboard.archiveCurrentThread} className="archive">
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
      <span className="tag">
        <i className="fa fa-tag" /> {folderNames.join(", ")}
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

    // Apply custom background color (but not during animations)
    const backgroundColor = this.getThreadBackgroundColor(this.state.hover || false);
    const style = backgroundColor && !this.state.archiving && !this.state.trashing
      ? { backgroundColor }
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
          <span className="date">{formatDate(latestEmail.date)}</span>
          {addresses}
        </h5>
        <h4>
          <Avatar address={latestEmailNotUs.from[0]} />
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
          <i className={`fa fa-${getAccountIconName(
            settingsStore.getAccountSettings(latestEmail.accountName)!,
          )}`} />
          &nbsp;{latestEmail.accountName}
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
