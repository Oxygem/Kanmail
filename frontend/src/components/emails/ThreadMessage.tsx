import _ from "lodash";
import React from "react";

import { Flag } from "../../../bindings/github.com/emersion/go-imap/v2/index.ts";
import { AppService, EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import Avatar from "../../components/Avatar.tsx";
import ThreadMessageAttachment from "../../components/emails/ThreadMessageAttachment.jsx";
import contactsStore from "../../stores/contacts.ts";
import requestStore from "../../stores/request.ts";
import systemStore from "../../stores/system.ts";
import { IThreadMessage } from "../../stores/thread.ts";
import { ensureInView } from "../../util/element.ts";
import { formatAddress, formatDate } from "../../util/string.ts";
import Tooltip from "../Tooltip.tsx";
import ThreadMessageContent from "./ThreadMessageContent.tsx";

class TrackerCount extends React.Component<{}, { count: number }> {
  constructor(props) {
    super(props);

    this.state = {
      count: 0,
    }
  }

  setCount = (n: number) => {
    this.setState({ count: n })
  }

  render() {
    if (this.state.count == 0) {
      return null;
    }

    return <Tooltip text={`Blocked ${this.state.count} tracking pixels`} position="right">
      <i className="fa fa-binoculars" /> {this.state.count}
    </Tooltip>;
  }
}

interface IThreadMessageProps {
  open: boolean;
  message: IThreadMessage;
  scrollToOnLoad: boolean;
}

interface IThreadMessageState {
  open: boolean;
  showImages: boolean;
  showTrackers: boolean;
  unsubscribed?: boolean;
}

export default class ThreadMessage extends React.Component<IThreadMessageProps, IThreadMessageState> {
  frameElement: HTMLIFrameElement;
  // TODO: needed?
  hasScrolledOnLoad: boolean;

  trackerCount: TrackerCount | null;

  constructor(props: IThreadMessageProps) {
    super(props);

    this.state = {
      open: props.open,
      showImages: props.message.showImages,
      showTrackers: false,
    };
  }

  getFromEmailAddresses = () => {
    return _.map(this.props.message.from, (email) => email[1]);
  };

  handleClick = () => {
    if (this.state.open) {
      this.setState({
        open: false,
      });
    } else {
      this.setState({
        open: true,
      });
    }
  };

  handleClickReply = () => {
    AppService.OpenSendWindow({
      mode: "reply",
      accountName: this.props.message.accountName,
      folderName: this.props.message.folderName,
      uid: this.props.message.uid,
    })
  };

  handleClickReplyAll = () => {
    AppService.OpenSendWindow({
      mode: "reply-all",
      accountName: this.props.message.accountName,
      folderName: this.props.message.folderName,
      uid: this.props.message.uid,
    })
  };

  handleClickForward = () => {
    AppService.OpenSendWindow({
      mode: "forward",
      accountName: this.props.message.accountName,
      folderName: this.props.message.folderName,
      uid: this.props.message.uid,
    })
  };

  // handleClickEdit = () => {
  //   openReplyToMessageWindow(this.props.message, { edit: true });
  // };

  renderStar() {
    const { message } = this.props;
    const starred = _.includes(message.flags, Flag.FlagFlagged);

    if (starred) {
      return <i className="fas fa-star"></i>;
    }
  }

  renderFolders() {
    if (systemStore.props.isDebug) {
      return _.map(this.props.message.folderUids, (uid, folderName) => (
        <Tooltip text={`(debug) UID: ${uid}`}>
          <span className="tag" key={folderName} onClick={() => AppService.OpenDebugWindow({
            accountName: this.props.message.accountName,
            folderName: folderName,
            uid: uid,
          })}>
            {folderName}
          </span>
        </Tooltip >
      ));
    }
    return _.map(this.props.message.folderUids, (uid, folderName) => (
      <span className="tag" key={folderName}>
        {folderName}
      </span>
    ));
  }

  renderAddresses(addresses) {
    return _.map(addresses, formatAddress).join(", ");
  }

  renderMeta() {
    const { message } = this.props;

    return (
      <div className="meta flex" onClick={this.handleClick}>
        <div className="addresses half">
          <Avatar address={message.from[0]} />
          {this.renderAddresses(message.from)}
          <br />
          <span className="meta-text">
            To: {this.renderAddresses(message.to)}
            {message.cc.length > 0
              ? `CC: ${this.renderAddresses(message.cc)}`
              : ""}
            {message.bcc.length > 0
              ? `${message.cc ? <br /> : ""}BCC: ${this.renderAddresses(
                message.bcc
              )}`
              : ""}
          </span>
        </div>
        <div className="date half">
          {formatDate(message.date)}
          <br />
          <span className="meta-text">{message.subject}</span>
          {this.renderStar()}
        </div>
      </div>
    );
  }

  renderUnsubscribeLink() {
    if (!this.props.message.listUnsubscribeURL) {
      return null;
    } else if (this.state.unsubscribed) {
      return "Unsubscribed!";
    }

    return <a
      onClick={(ev) => {
        if (this.props.message.listUnsubscribeOneClick) {
          EmailsService.OneClickAccountFolderEmailUnsubscribe(this.props.message.accountName, this.props.message.folderName, this.props.message.uid).then(() => {
            this.setState({
              unsubscribed: true,
            });
          }).catch(e => {
            requestStore.addError("Failed to POST unsubscribe", e);
          })
          return
        }
        AppService.OpenLink(this.props.message.listUnsubscribeURL);
      }}
    >
      Unsubscribe{this.props.message.listUnsubscribeOneClick ? null : ` (open ${this.props.message.listUnsubscribeURL})`}
    </a>;
  }

  renderControls() {
    const { message } = this.props;

    const isDraft = _.includes(_.keys(this.props.message.folderUids), "drafts");
    const forwardButton = isDraft ? null : (
      <a onClick={this.handleClickForward}>
        <i className="fa fa-send"></i>
        Forward
      </a>
    );
    const replyButton = isDraft ? null : (
      <a onClick={this.handleClickReply}>
        <i className="fa fa-reply"></i>
        Reply
      </a>
    );
    const replyAllButton = isDraft ? null : (
      <a onClick={this.handleClickReplyAll}>
        <i className="fa fa-reply-all"></i>
        Reply All
      </a>
    );
    // const editButton = isDraft ? (
    //   <a onClick={this.handleClickEdit}>
    //     <i className="fa fa-pencil"></i>
    //     Edit
    //   </a>
    // ) : null;

    const trackerCount = this.state.showTrackers ? null : <a
      className="tracker-count"
      onClick={() => this.setState({ showTrackers: true })}
    ><TrackerCount ref={t => this.trackerCount = t} /></a>;

    return (
      <div className="controls">
        <div>
          {this.renderFolders()}
          {trackerCount}
          {this.renderUnsubscribeLink()}
        </div>
        <div>
          {forwardButton}
          {replyButton}
          {replyAllButton}
          {/*{editButton}*/}
        </div>
      </div>
    );
  }

  renderBody() {
    const { message } = this.props;
    return <ThreadMessageContent
      body={message.body}
      parts={message.parts}
      folderName={message.folderName}
      accountName={message.accountName}
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
      setTrackerCount={(n: number) => {
        if (this.trackerCount) {
          this.trackerCount.setCount(n);
        }
      }}
    />;
  }

  renderAttachments() {
    return _.map(this.props.message.parts, (part) => {
      return (
        <ThreadMessageAttachment
          key={part.partStr}
          partId={part.partStr}
          part={part}
          message={this.props.message}
        />
      );
    });
  }

  isTrashed() {
    return _.isNumber(this.props.message.folderUids.trash);
  }

  render() {
    const { message } = this.props;

    const classNames = ["message"];
    if (this.isTrashed()) {
      classNames.push("trash");
    }

    return (
      <div
        key={message.messageId}
        className={classNames.join(" ")}
        ref={(ref) => {
          if (ref && !this.hasScrolledOnLoad && this.props.scrollToOnLoad) {
            ensureInView(ref, { behavior: "smooth", block: "start", inline: "start" });
            this.hasScrolledOnLoad = true;
          }
        }}
      >
        {this.renderMeta()}
        {this.state.open && this.renderControls()}
        {this.state.open && this.renderBody()}
        {this.state.open && this.renderAttachments()}
      </div>
    );
  }
}
