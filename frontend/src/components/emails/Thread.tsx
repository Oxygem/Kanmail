import _ from "lodash";
import React from "react";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import Avatar from "../../components/Avatar.tsx";
import Icon from "../../components/Icon.tsx";
import Tooltip from "../../components/Tooltip.tsx";
import QuickReply from "../../components/emails/QuickReply.tsx";
import ThreadMessage, { ReplyMode } from "../../components/emails/ThreadMessage.tsx";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore from "../../stores/settings.ts";
import threadStore, { IThreadMessage, IThreadStoreProps } from "../../stores/thread.ts";
import { addressKey, getAccountEmails } from "../../util/send.ts";
import { capitalizeFirstLetter, dayKey, formatAddress, formatDay, stripSubjectPrefixes } from "../../util/string.ts";

const MAX_HEADER_AVATARS = 3;
const MAX_HEADER_NAMES = 3;
const LATEST_MESSAGES_SHOWN = 3;
const MIN_EARLIER_COLLAPSED = 2;
const SCROLL_OFFSET = 12;
const NEW_MESSAGE_SEEN_OFFSET = 40;

interface IThreadProps extends IThreadStoreProps {
}

interface IThreadState {
  openCount: number;
  showAllMessages: boolean;
  newBelow: string[];
}

type StreamItem = IThreadMessage | { earlierCount: number };

class Thread extends React.Component<Partial<IThreadProps>, IThreadState> {
  private contentElement: HTMLElement | null = null;
  private messageElements = new Map<string, HTMLElement>();
  private scrolledOpenCount = -1;
  private scrolledMessageCount = 0;
  private scrollFrame: number | null = null;
  private seenNewMessageIds = new Set<string>();

  state: IThreadState = {
    openCount: -1,
    showAllMessages: false,
    newBelow: [],
  };

  static getDerivedStateFromProps(props: Partial<IThreadProps>, state: IThreadState) {
    if (props.openCount !== state.openCount) {
      return { openCount: props.openCount, showAllMessages: false, newBelow: [] };
    }
    return null;
  }

  componentDidUpdate() {
    const { messages, fetching, openCount } = this.props;
    if (fetching || !messages || messages.length === 0) {
      return;
    }

    if (this.scrolledOpenCount !== openCount) {
      this.scrolledOpenCount = openCount!;
      this.scrolledMessageCount = messages.length;
      this.seenNewMessageIds = new Set();
      this.scrollToStart();
    } else if (messages.length > this.scrolledMessageCount) {
      this.scrolledMessageCount = messages.length;
      this.scrollToMessage(_.last(messages)!, "smooth");
    }

    this.updateNewBelow();
  }

  componentWillUnmount() {
    if (this.scrollFrame !== null) {
      cancelAnimationFrame(this.scrollFrame);
    }
  }

  handleClickClose() {
    threadStore.close();
  }

  getOwnEmails(accountID: string): Set<string> {
    return getAccountEmails(settingsStore.getAccountSettings(accountID));
  }

  isOwnMessage(message: IThreadMessage): boolean {
    const ownEmails = this.getOwnEmails(message.accountID);
    return message.from.length > 0 && _.every(message.from, address => ownEmails.has(addressKey(address)));
  }

  getMessageAddresses(pick: (message: IThreadMessage) => Address[]): Address[] {
    const seen = new Set<string>();
    const addresses: Address[] = [];
    _.each(_.reverse([...this.props.thread!]), (message: IThreadMessage) => {
      const ownEmails = this.getOwnEmails(message.accountID);
      _.each(pick(message), address => {
        const key = addressKey(address);
        if (key && !ownEmails.has(key) && !seen.has(key)) {
          seen.add(key);
          addresses.push(address);
        }
      });
    });
    return addresses;
  }

  getParticipants(): Address[] {
    const senders = this.getMessageAddresses(message => message.from);
    if (senders.length > 0) {
      return senders;
    }
    return this.getMessageAddresses(message => _.concat(message.to, message.cc));
  }

  getSubject(): string {
    const { thread } = this.props;
    if (!thread || thread.length === 0) {
      return "Unknown thread";
    }
    return stripSubjectPrefixes(thread[0].subject);
  }

  getNewMessages(): IThreadMessage[] {
    const { messages, newMessageIds } = this.props;
    return _.filter(messages, message => newMessageIds!.has(message.accountMessageId));
  }

  getFirstNewIndex(): number {
    const { messages, newMessageIds } = this.props;
    return _.findIndex(messages, message => newMessageIds!.has(message.accountMessageId));
  }

  // Lands on the first new message (or the latest), with the date line
  // above it just out of view
  scrollToStart() {
    const messages = this.props.messages!;
    const firstNewIndex = this.getFirstNewIndex();
    const target = firstNewIndex > 0 ? messages[firstNewIndex] : _.last(messages)!;
    this.scrollToMessage(target, "auto");
  }

  scrollToMessage(message: IThreadMessage, behavior: ScrollBehavior) {
    const element = this.messageElements.get(message.accountMessageId);
    if (element && this.contentElement) {
      this.contentElement.scrollTo({ top: element.offsetTop - SCROLL_OFFSET, behavior });
    }
  }

  updateNewBelow = () => {
    const container = this.contentElement;
    if (!container) {
      return;
    }
    const visibleBottom = container.scrollTop + container.clientHeight;
    const newBelow = _.compact(_.map(this.getNewMessages(), message => {
      const id = message.accountMessageId;
      const element = this.messageElements.get(id);
      if (!element || this.seenNewMessageIds.has(id)) {
        return null;
      }
      if (element.offsetTop + NEW_MESSAGE_SEEN_OFFSET <= visibleBottom) {
        this.seenNewMessageIds.add(id);
        return null;
      }
      return id;
    }));
    if (!_.isEqual(newBelow, this.state.newBelow)) {
      this.setState({ newBelow });
    }
  };

  handleScroll = () => {
    if (this.scrollFrame === null) {
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = null;
        this.updateNewBelow();
      });
    }
  };

  handleClickNewBelow = () => {
    const message = _.find(this.props.messages, m => m.accountMessageId === this.state.newBelow[0]);
    if (message) {
      this.scrollToMessage(message, "smooth");
    }
  };

  handleReply = (message: IThreadMessage, mode: ReplyMode) => {
    const latest = _.last(this.props.messages);
    if (message === latest && keyboard.quickReply) {
      keyboard.quickReply.handleExpand(mode);
      return;
    }
    AppService.OpenSendWindow({
      mode,
      accountID: message.accountID,
      folderName: message.folderName,
      uid: message.uid,
    });
  };

  renderParticipants() {
    const participants = this.getParticipants();
    if (participants.length === 0) {
      return { avatars: null, names: null };
    }

    const names = participants.length === 1
      ? participants[0].name || participants[0].email
      : _.map(participants.slice(0, MAX_HEADER_NAMES), address => formatAddress(address, true)).join(", ")
      + (participants.length > MAX_HEADER_NAMES ? ` +${participants.length - MAX_HEADER_NAMES}` : "");

    const avatars = (
      <div className={`avatar-stack count-${Math.min(participants.length, MAX_HEADER_AVATARS)}`}>
        {_.map(participants.slice(0, MAX_HEADER_AVATARS), address => (
          <Avatar key={addressKey(address)} address={address} />
        ))}
      </div>
    );

    return { avatars, names: <span className="participants">{names}</span> };
  }

  renderAccounts() {
    const { thread } = this.props;
    if (_.some(thread, message => message.welcome)) {
      return null;
    }

    return _.map(_.uniq(_.map(thread, message => message.accountID)), accountID => (
      <span className="account" key={accountID}>
        <i style={{ background: settingsStore.getAccountAccentColor(accountID) || "var(--faint)" }} />
        {settingsStore.getAccountName(accountID)}
      </span>
    ));
  }

  renderFolderChips() {
    const folders = _.without(
      _.uniq(_.flatMap(this.props.thread, message => _.keys(message.folderUids))),
      "sent",
    );
    return _.map(folders, folder => (
      <span className="chip" key={folder}>{capitalizeFirstLetter(folder)}</span>
    ));
  }

  renderActions() {
    const accountID = this.props.thread?.[0]?.accountID;
    const deleteOnTrash = keyboard.currentComponent
      ? keyboard.currentComponent.isDeleteOnTrash()
      : Boolean(accountID && settingsStore.getAccountSettings(accountID)?.settings.deleteOnTrash);

    return (
      <div className="reader-actions">
        <Tooltip position="top" text={<span>Move (<i className="fa fa-keyboard-o" /> m)</span>}>
          <button type="button" className="icon-btn" onClick={(ev) => keyboard.startMoveCurrentThread(ev)}>
            <Icon name="folder" />
          </button>
        </Tooltip>
        <Tooltip position="top" text={<span>Archive (<i className="fa fa-keyboard-o" /> enter)</span>}>
          <button type="button" className="icon-btn" onClick={(ev) => keyboard.archiveCurrentThread(ev)}>
            <Icon name="archive" />
          </button>
        </Tooltip>
        <Tooltip
          position="top"
          text={<span>{deleteOnTrash ? "Delete permanently" : "Trash"} (<i className="fa fa-keyboard-o" /> backspace)</span>}
        >
          <button type="button" className="icon-btn danger" onClick={(ev) => keyboard.trashCurrentThread(ev)}>
            <Icon name="trash" />
          </button>
        </Tooltip>
        <span className="vrule" />
        <Tooltip position="top" text={<span>Close (<i className="fa fa-keyboard-o" /> esc)</span>}>
          <button type="button" className="icon-btn" onClick={this.handleClickClose}>
            <Icon name="x" size={20} />
          </button>
        </Tooltip>
      </div>
    );
  }

  renderMergedSubjects() {
    const { thread } = this.props;
    const subjects = _.uniq(_.map(thread, message => stripSubjectPrefixes(message.subject)));
    return (
      <span>
        {thread!.mergedThreads} merged threads:
        {_.map(subjects, subject => <span key={subject}><br />{subject}</span>)}
      </span>
    );
  }

  renderHead() {
    const { thread } = this.props;
    const { avatars, names } = this.renderParticipants();

    return (
      <div className="reader-head">
        {avatars}
        <div className="reader-title">
          <h2 title={this.getSubject()}>
            {thread?.mergedThreads && (
              <Tooltip text={this.renderMergedSubjects()}>
                <span className="multi-subject tooltip-wrapper">x{thread.mergedThreads}</span>
              </Tooltip>
            )}
            {this.getSubject()}
          </h2>
          <div className="reader-meta">
            {names}
            {this.renderAccounts()}
            {this.renderFolderChips()}
          </div>
        </div>
        {this.renderActions()}
      </div>
    );
  }

  getStreamItems(): StreamItem[] {
    const messages = this.props.messages!;
    const firstNewIndex = this.getFirstNewIndex();

    let latestStart = Math.max(1, messages.length - LATEST_MESSAGES_SHOWN);
    if (firstNewIndex > 0) {
      latestStart = Math.min(latestStart, firstNewIndex);
    }
    const earlierCount = latestStart - 1;

    if (this.state.showAllMessages || earlierCount < MIN_EARLIER_COLLAPSED) {
      return messages;
    }
    return [messages[0], { earlierCount }, ...messages.slice(latestStart)];
  }

  renderStream() {
    const messages = this.props.messages!;
    const subject = stripSubjectPrefixes(this.props.thread?.[0]?.subject || "");
    const newMessages = this.getNewMessages();
    const firstNewIndex = this.getFirstNewIndex();
    const latest = _.last(messages);

    const showDays = messages.length > 1;
    let previousDay: string | null = null;
    let newDividerShown = false;

    return _.flatMap(this.getStreamItems(), (item) => {
      if ("earlierCount" in item) {
        return [
          <button
            type="button"
            key="earlier"
            className="stream-earlier"
            onClick={() => this.setState({ showAllMessages: true })}
          >
            {item.earlierCount} earlier messages
          </button>,
        ];
      }

      const message = item;
      const elements: React.ReactNode[] = [];
      const day = dayKey(message.date);
      const isNew = this.props.newMessageIds!.has(message.accountMessageId);

      if (isNew && !newDividerShown && firstNewIndex > 0) {
        newDividerShown = true;
        const newLabel = `${newMessages.length} new`;
        elements.push(
          <div key={`new-${message.accountMessageId}`} className="stream-divider new">
            <span>{day !== previousDay ? `${formatDay(message.date)} · ${newLabel}` : newLabel}</span>
          </div>,
        );
      } else if (showDays && day !== previousDay) {
        elements.push(
          <div key={`day-${day}-${message.accountMessageId}`} className="stream-divider">
            <span>{formatDay(message.date)}</span>
          </div>,
        );
      }
      previousDay = day;

      elements.push(
        <ThreadMessage
          key={message.messageId || message.accountMessageId}
          message={message}
          open={isNew || message === latest}
          showDay={!showDays}
          isOwn={this.isOwnMessage(message)}
          ownEmails={this.getOwnEmails(message.accountID)}
          threadSubject={subject}
          onReply={this.handleReply}
          elementRef={(element) => {
            if (element) {
              this.messageElements.set(message.accountMessageId, element);
            } else {
              this.messageElements.delete(message.accountMessageId);
            }
          }}
        />,
      );
      return elements;
    });
  }

  renderContent() {
    if (this.props.fetching) {
      return (
        <div className="loader">
          <Icon name="loader" size={22} className="spin" />
        </div>
      );
    }
    return this.renderStream();
  }

  renderNewBelow() {
    const count = this.state.newBelow.length;
    if (count === 0 || this.props.fetching) {
      return null;
    }
    return (
      <button type="button" className="new-below" onClick={this.handleClickNewBelow}>
        <Icon name="arrow-down" size={16} />
        {count} more new message{count > 1 ? "s" : ""}
      </button>
    );
  }

  renderQuickReply() {
    const { messages, fetching } = this.props;
    if (fetching || !messages || messages.length === 0) {
      return null;
    }
    const latestMessage = messages[messages.length - 1];
    const isDraft = _.includes(_.keys(latestMessage.folderUids), "drafts");
    if (isDraft || latestMessage.welcome) {
      return null;
    }
    return <QuickReply latestMessage={latestMessage} />;
  }

  render() {
    if (!this.props.messages) {
      return null;
    }

    return (
      <section id="threadarea">
        <section
          id="thread-background"
          onClick={this.handleClickClose}
        ></section>
        <section
          id="thread"
          onClick={(ev) => ev.stopPropagation()}
        >
          {this.renderHead()}
          <div className="stream-wrap">
            <section
              id="content"
              ref={(element) => this.contentElement = element}
              onScroll={this.handleScroll}
            >
              {this.renderContent()}
            </section>
            {this.renderNewBelow()}
          </div>
          {this.renderQuickReply()}
        </section>
      </section>
    );
  }
}

// Wrap Thread and re-generate it when the messages we're showing change/vanish
@subscribe(threadStore)
export default class ThreadWrapper extends React.Component<Partial<IThreadProps>> {
  render() {
    return <Thread {...this.props} />;
  }
}
