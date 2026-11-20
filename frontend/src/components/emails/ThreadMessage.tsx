import _ from "lodash";
import React from "react";

import { Flag } from "../../../bindings/github.com/emersion/go-imap/v2/index.ts";
import { AppService, EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address, BodyPart } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import Avatar from "../../components/Avatar.tsx";
import contactsStore from "../../stores/contacts.ts";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import { IThreadMessage } from "../../stores/thread.ts";
import { addressKey, hasReplyAllRecipients } from "../../util/send.ts";
import { formatAddress, formatDayTime, formatLongDate, formatTime, stripSubjectPrefixes } from "../../util/string.ts";
import Icon from "../Icon.tsx";
import PopoverMenu, { MenuItem, MenuSeparator } from "../PopoverMenu.tsx";
import Tooltip from "../Tooltip.tsx";
import ThreadMessageAttachment, { isImageAttachment } from "./ThreadMessageAttachment.tsx";
import ThreadMessageContent from "./ThreadMessageContent.tsx";
import WelcomeMessage from "./WelcomeMessage.tsx";

export type ReplyMode = "reply" | "reply-all" | "forward";

const MAX_RECIPIENT_NAMES = 4;

interface IThreadMessageProps {
  message: IThreadMessage;
  open: boolean;
  showDay: boolean;
  isOwn: boolean;
  ownEmails: Set<string>;
  threadSubject: string;
  onReply: (message: IThreadMessage, mode: ReplyMode) => void;
  elementRef: (element: HTMLDivElement | null) => void;
}

interface IThreadMessageState {
  open: boolean;
  showImages: boolean;
  showTrackers: boolean;
  trackerCount: number;
  unsubscribed?: boolean;
}

export default class ThreadMessage extends React.Component<IThreadMessageProps, IThreadMessageState> {
  constructor(props: IThreadMessageProps) {
    super(props);

    this.state = {
      open: props.open,
      showImages: props.message.showImages,
      showTrackers: false,
      trackerCount: 0,
    };
  }

  toggleOpen = () => {
    this.setState({ open: !this.state.open });
  };

  isDraft() {
    return _.includes(_.keys(this.props.message.folderUids), "drafts");
  }

  isTrashed() {
    return _.isNumber(this.props.message.folderUids.trash);
  }

  getSenderName(): string {
    if (this.props.isOwn) {
      return "You";
    }
    const sender = this.props.message.from[0];
    return sender?.name || sender?.email || "(unknown)";
  }

  shortNames(addresses: Address[]): { names: string[], includesYou: boolean } {
    let includesYou = false;
    const names: string[] = [];
    _.each(addresses, address => {
      if (this.props.ownEmails.has(addressKey(address))) {
        includesYou = true;
      } else {
        names.push(formatAddress(address, true));
      }
    });
    return { names: _.uniq(names), includesYou };
  }

  renderRecipients(): string {
    const { message, isOwn } = this.props;

    const visible = this.shortNames(_.concat(message.to, message.cc));
    const recipients = visible.includesYou ? ["you", ...visible.names] : visible.names;
    const shown = recipients.length > MAX_RECIPIENT_NAMES
      ? [...recipients.slice(0, MAX_RECIPIENT_NAMES - 1), `+${recipients.length - MAX_RECIPIENT_NAMES + 1}`]
      : recipients;

    const blind = this.shortNames(message.bcc);
    const bcc = blind.includesYou ? ["you", ...blind.names] : blind.names;
    // Mail that reached us without naming us on To/Cc was blind copied, unless
    // it came through a mailing list
    if (!isOwn && !visible.includesYou && !blind.includesYou && !message.listUnsubscribeURL) {
      bcc.push("you");
    }

    const parts: string[] = [];
    if (shown.length > 0) {
      parts.push(`to ${shown.join(", ")}`);
    }
    if (bcc.length > 0) {
      parts.push(`bcc ${bcc.join(", ")}`);
    }
    return parts.join(", ");
  }

  handleClickUnsubscribe = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    const { message } = this.props;

    if (message.listUnsubscribeOneClick) {
      EmailsService.OneClickAccountFolderEmailUnsubscribe(message.accountID, message.folderName, message.uid).then(() => {
        this.setState({ unsubscribed: true });
      }).catch(e => {
        requestStore.addError("Failed to POST unsubscribe", e);
      });
      return;
    }
    AppService.OpenLink(message.listUnsubscribeURL);
  };

  renderUnsubscribe() {
    const { message } = this.props;
    if (!message.listUnsubscribeURL) {
      return null;
    } else if (this.state.unsubscribed) {
      return <span className="unsubscribe done">Unsubscribed</span>;
    }

    return (
      <a
        className="unsubscribe"
        title={message.listUnsubscribeOneClick ? undefined : message.listUnsubscribeURL}
        onClick={this.handleClickUnsubscribe}
      >
        Unsubscribe
      </a>
    );
  }

  renderDetails() {
    const { message } = this.props;
    const rows: [string, string][] = [
      ["From", _.map(message.from, a => formatAddress(a)).join(", ")],
      ["To", _.map(message.to, a => formatAddress(a)).join(", ")],
      ["Cc", _.map(message.cc, a => formatAddress(a)).join(", ")],
      ["Bcc", _.map(message.bcc, a => formatAddress(a)).join(", ")],
      ["Date", formatLongDate(message.date)],
      ["Subject", message.subject],
    ];

    return (
      <div className="menu-details">
        {_.map(_.filter(rows, ([, value]) => Boolean(value)), ([label, value]) => (
          <div className="detail-row" key={label}>
            <span className="detail-label">{label}</span>
            <span className="detail-value">{value}</span>
          </div>
        ))}
      </div>
    );
  }

  renderMenu() {
    const { message, onReply } = this.props;
    const isDraft = this.isDraft();
    const canReplyAll = hasReplyAllRecipients(message, settingsStore.getAccountSettings(message.accountID));
    const showTrackersItem = this.state.trackerCount > 0 && !this.state.showTrackers;

    return (
      <PopoverMenu
        trigger={<Icon name="more" size={18} />}
        triggerClassName="icon-btn more"
        title="More"
      >
        {(close) => <>
          {this.renderDetails()}
          {!isDraft && <>
            <MenuSeparator />
            <MenuItem icon="reply" label="Reply" close={close} onClick={() => onReply(message, "reply")} />
            {canReplyAll && (
              <MenuItem icon="reply-all" label="Reply all" close={close} onClick={() => onReply(message, "reply-all")} />
            )}
            <MenuItem icon="forward" label="Forward" close={close} onClick={() => onReply(message, "forward")} />
          </>}
          {showTrackersItem && <>
            <MenuSeparator />
            <MenuItem
              icon="eye"
              label={`Show ${this.state.trackerCount} blocked tracker${this.state.trackerCount > 1 ? "s" : ""}`}
              close={close}
              onClick={() => this.setState({ showTrackers: true })}
            />
          </>}
          {systemStore.props.isDebug && <>
            <MenuSeparator />
            {_.map(message.folderUids, (uid, folderName) => (
              <MenuItem
                key={folderName}
                label={`Debug ${folderName} UID ${uid}`}
                close={close}
                onClick={() => AppService.OpenDebugWindow({
                  accountID: message.accountID,
                  folderName,
                  uid,
                })}
              />
            ))}
          </>}
        </>}
      </PopoverMenu>
    );
  }

  renderSenderName() {
    const sender = this.props.message.from[0];
    const name = <span className="name">{this.getSenderName()}</span>;

    if (!sender?.email) {
      return name;
    }
    return <Tooltip text={sender.email}>{name}</Tooltip>;
  }

  renderHead() {
    const { message } = this.props;
    const starred = _.includes(message.flags, Flag.FlagFlagged);

    return (
      <div className="bubble-head" onClick={this.toggleOpen}>
        {this.renderSenderName()}
        {starred && <Icon name="star" size={13} className="starred" />}
        <span className="recipients">{this.renderRecipients()}</span>
        {this.renderUnsubscribe()}
        <span className="spacer" />
        <Tooltip text={formatLongDate(message.date)} position="top">
          <span className="time">
            {this.props.showDay ? formatDayTime(message.date) : formatTime(message.date)}
          </span>
        </Tooltip>
        {!message.welcome && this.renderMenu()}
      </div>
    );
  }

  renderSubject() {
    const subject = stripSubjectPrefixes(this.props.message.subject);
    if (!subject || subject === this.props.threadSubject) {
      return null;
    }
    return <div className="bubble-subject">{subject}</div>;
  }

  renderBody() {
    const { message } = this.props;

    if (message.welcome) {
      return <WelcomeMessage />;
    }

    return <ThreadMessageContent
      body={message.body}
      parts={message.parts}
      folderName={message.folderName}
      accountID={message.accountID}
      uid={message.uid}
      trusted={message.trusted}
      showImages={this.state.showImages}
      showTrackers={this.state.showTrackers}
      sender={formatAddress(message.from[0])}
      clickShowImages={() => {
        this.setState({ showImages: true })
      }}
      clickAlwaysShowImages={() => {
        // This isn't subscribed anywhere, it's checked in the thread store when fetching any other
        // thread, so we just set the state here to update, next thread load will fetch from store.
        contactsStore.addAlwaysShowImages(message.from[0]);
        this.setState({ showImages: true })
      }}
      setTrackerCount={(trackerCount: number) => {
        if (trackerCount !== this.state.trackerCount) {
          this.setState({ trackerCount });
        }
      }}
    />;
  }

  getAttachmentParts(): BodyPart[] {
    const { message } = this.props;
    const showHidden = settingsStore.props.system.showHiddenAttachments;

    return _.filter(message.parts, part => {
      const contentID = (part.contentID || "").replace(/[<>]/g, "");
      const isInline = Boolean(contentID) && (message.body || "").includes(`cid:${contentID}`);
      return !isInline && (Boolean(part.description) || showHidden);
    });
  }

  renderAttachments() {
    const [images, files] = _.partition(this.getAttachmentParts(), isImageAttachment);
    if (images.length === 0 && files.length === 0) {
      return null;
    }

    const renderPart = (part: BodyPart) => (
      <ThreadMessageAttachment key={part.partStr} part={part} message={this.props.message} />
    );

    return (
      <div className="attachments">
        {images.length > 0 && <div className="attach-images">{_.map(images, renderPart)}</div>}
        {files.length > 0 && <div className="attach-files">{_.map(files, renderPart)}</div>}
      </div>
    );
  }

  renderCollapsed() {
    return (
      <div className="bubble collapsed" onClick={this.toggleOpen}>
        <span className="name">{this.getSenderName()}</span>
        <span className="excerpt" dangerouslySetInnerHTML={{ __html: this.props.message.excerpt }} />
        <Icon name="chevron-down" size={16} className="chevron" />
      </div>
    );
  }

  renderOpen() {
    return (
      <div className="bubble">
        {this.renderHead()}
        {this.renderSubject()}
        <div className="bubble-body">{this.renderBody()}</div>
        {this.renderAttachments()}
      </div>
    );
  }

  render() {
    const { message, isOwn } = this.props;

    const classNames = ["message", isOwn ? "own" : "other"];
    if (!message.trusted && !message.welcome) {
      classNames.push("html");
    }
    if (this.isTrashed()) {
      classNames.push("trash");
    }

    return (
      <div className={classNames.join(" ")} ref={this.props.elementRef}>
        {!isOwn && <Avatar address={message.from[0]} />}
        {this.state.open ? this.renderOpen() : this.renderCollapsed()}
      </div>
    );
  }
}
