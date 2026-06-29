import _ from "lodash";
import React from "react";

import { SendOptions } from "../../../bindings/github.com/oxygem/kanmail/internal/emails/models.ts";
import {
  AppService,
  EmailsService,
} from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard from "../../keyboard.ts";
import mainEmailStore from "../../stores/emails/main.ts";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import { IThreadMessage } from "../../stores/thread.ts";
import threadStore from "../../stores/thread.ts";
import { trackEvent } from "../../util/analytics.ts";
import { stopEventPropagation } from "../../util/element.ts";
import { getAccountContactOptions, prependIfNotPresent } from "../../util/send.ts";
import { formatAddress } from "../../util/string.ts";
import SquireEditor from "../send/SquireEditor.tsx";

type Mode = "reply" | "reply-all";

interface IQuickReplyProps {
  latestMessage: IThreadMessage;
}

interface IQuickReplyState {
  expanded: boolean;
  mode: Mode;
  html: string;
  isSending: boolean;
  isSentOrSaved?: boolean;
}

export default class QuickReply extends React.Component<IQuickReplyProps, IQuickReplyState> {
  private releaseKeyboard: (() => void) | null = null;

  constructor(props: IQuickReplyProps) {
    super(props);
    this.state = {
      expanded: false,
      mode: "reply",
      html: "",
      isSending: false,
    };
  }

  componentDidUpdate(_prevProps: IQuickReplyProps, prevState: IQuickReplyState) {
    if (this.state.expanded && !prevState.expanded) {
      this.suspendKeyboard();
    } else if (!this.state.expanded && prevState.expanded) {
      this.resumeKeyboard();
    }
  }

  componentWillUnmount() {
    this.resumeKeyboard();
  }

  suspendKeyboard() {
    if (!this.releaseKeyboard) {
      this.releaseKeyboard = keyboard.suspend("QuickReply");
    }
  }

  resumeKeyboard() {
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
    }
  }

  getFromAddress(): Address | null {
    const account = _.find(
      settingsStore.props.accounts,
      a => a.name === this.props.latestMessage.accountName,
    );
    if (!account) {
      return null;
    }
    return getAccountContactOptions(account)[0].value[1];
  }

  handleExpand = (mode: Mode = "reply") => {
    const hasCc = this.props.latestMessage.cc && this.props.latestMessage.cc.length > 0;
    this.setState({ expanded: true, mode: mode === "reply-all" && !hasCc ? "reply" : mode });
  };

  handleForward = () => {
    const { latestMessage } = this.props;
    AppService.OpenSendWindow({
      mode: "forward",
      accountName: latestMessage.accountName,
      folderName: latestMessage.folderName,
      uid: latestMessage.uid,
    });
  };

  handleCancel = () => {
    this.setState({
      expanded: false,
      html: "",
      isSentOrSaved: undefined,
    });
  };

  handleSetMode = (mode: Mode) => {
    this.setState({ mode });
  };

  handlePopOut = () => {
    const { latestMessage } = this.props;
    AppService.OpenSendWindow({
      mode: this.state.mode,
      accountName: latestMessage.accountName,
      folderName: latestMessage.folderName,
      uid: latestMessage.uid,
    });
    this.handleCancel();
  };

  handleSend = () => {
    if (this.state.isSending) {
      return;
    }

    const { latestMessage } = this.props;
    const from = this.getFromAddress();
    if (!from) {
      requestStore.addError(
        "Quick reply",
        new Error(`No account found for ${latestMessage.accountName}`),
      );
      return;
    }

    const to = latestMessage.replyTo && latestMessage.replyTo.length > 0
      ? latestMessage.replyTo
      : latestMessage.from;

    const cc = this.state.mode === "reply-all" ? latestMessage.cc : [];

    const sendOptions: SendOptions = {
      subject: prependIfNotPresent(latestMessage.subject, "Re"),
      html: this.state.html,
      text: "",
      from,
      to,
      cc,
      attachments: [],
      replyingTo: latestMessage,
    };

    this.setState({ isSending: true, isSentOrSaved: undefined });

    const sentBodyHtml = this.state.html;

    EmailsService.SendEmail(latestMessage.accountName, sendOptions).then(sentEmail => {
      trackEvent("QuickReply");
      this.setState({
        isSending: false,
        isSentOrSaved: true,
        html: "",
        expanded: false,
      });

      if (sentEmail) {
        const newThread = mainEmailStore.injectSentEmail(sentEmail);
        if (newThread) {
          const knownBodies = new Map<string, string>([
            [`${sentEmail.accountName}-${sentEmail.messageId}`, sentBodyHtml],
          ]);
          threadStore.replaceCurrentThread(newThread, knownBodies);
        } else {
          threadStore.reloadThread();
        }
        // Kick a background sync so the real server-side message reconciles.
        mainEmailStore.syncFolderEmails("sent", {
          accountNames: [latestMessage.accountName],
        }).catch(() => {});
      } else {
        threadStore.reloadThread();
      }
    }).catch(e => {
      this.setState({ isSending: false, isSentOrSaved: false });
      requestStore.addError("Failed to send quick reply", e);
    });
  };

  renderCollapsed() {
    const { latestMessage } = this.props;
    const hasCc = latestMessage.cc && latestMessage.cc.length > 0;

    return (
      <div className="reply-dock" onClick={stopEventPropagation}>
        <button
          type="button"
          className="btn-primary lg"
          onClick={() => this.handleExpand("reply")}
        >
          <i className="fa fa-reply"></i> Reply
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => this.handleExpand("reply-all")}
          disabled={!hasCc}
          title={hasCc ? "" : "No CC recipients to reply to"}
        >
          <i className="fa fa-reply-all"></i> Reply all
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={this.handleForward}
        >
          <i className="fa fa-share"></i> Forward
        </button>
        <span className="spacer"></span>
        <span className="dock-meta" onClick={this.handlePopOut}>
          <i className="fa fa-external-link"></i> Pop out
        </span>
      </div>
    );
  }

  renderSendButtonContent() {
    if (this.state.isSending) {
      return <><i className="fa fa-spin fa-refresh" /> Sending</>;
    }
    if (this.state.isSentOrSaved === false) {
      return <><i className="fa fa-times" /> Error</>;
    }
    return <><i className="fa fa-paper-plane" /> Send</>;
  }

  renderRecipientSummary() {
    const { latestMessage } = this.props;
    const replyTo = latestMessage.replyTo && latestMessage.replyTo.length > 0
      ? latestMessage.replyTo
      : latestMessage.from;
    const toLabel = (replyTo || []).map(a => formatAddress(a)).join(", ");
    const ccLabel = this.state.mode === "reply-all"
      && latestMessage.cc && latestMessage.cc.length > 0
      ? latestMessage.cc.map(a => formatAddress(a)).join(", ")
      : null;

    return (
      <div className="recipients">
        <span className="label">To</span>
        <span className="value" title={toLabel}>{toLabel}</span>
        {ccLabel && <>
          <span className="label">Cc</span>
          <span className="value" title={ccLabel}>{ccLabel}</span>
        </>}
      </div>
    );
  }

  renderExpanded() {
    const { latestMessage } = this.props;
    const hasCc = latestMessage.cc && latestMessage.cc.length > 0;
    const sendClasses = ["submit"];
    if (this.state.isSending) sendClasses.push("disabled");
    if (this.state.isSentOrSaved === false) sendClasses.push("error");

    return (
      <div className="quick-reply expanded" onClick={stopEventPropagation}>
        <div className="quick-reply-header">
          <div className="mode-toggle">
            <button
              type="button"
              className={this.state.mode === "reply" ? "active" : ""}
              onClick={() => this.handleSetMode("reply")}
            >
              <i className="fa fa-reply"></i> Reply
            </button>
            <button
              type="button"
              className={this.state.mode === "reply-all" ? "active" : ""}
              onClick={() => this.handleSetMode("reply-all")}
              disabled={!hasCc}
              title={hasCc ? "" : "No CC recipients to reply to"}
            >
              <i className="fa fa-reply-all"></i> Reply all
            </button>
          </div>
          <a className="pop-out" onClick={this.handlePopOut} title="Open in full editor">
            <i className="fa fa-external-link"></i> Pop out
          </a>
        </div>

        {this.renderRecipientSummary()}

        <SquireEditor
          initialContent=""
          onUpdate={(data) => this.setState({ html: data })}
        />

        <div className="quick-reply-actions">
          <button
            type="button"
            className="cancel"
            onClick={this.handleCancel}
            disabled={this.state.isSending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={sendClasses.join(" ")}
            onClick={this.handleSend}
            disabled={this.state.isSending}
          >
            {this.renderSendButtonContent()}
          </button>
        </div>
      </div>
    );
  }

  render() {
    return this.state.expanded ? this.renderExpanded() : this.renderCollapsed();
  }
}
