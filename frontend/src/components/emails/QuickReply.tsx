import _ from "lodash";
import React from "react";

import {
  SendAttachment,
  SendOptions,
} from "../../../bindings/github.com/oxygem/kanmail/internal/emails/models.ts";
import {
  AppService,
  EmailsService,
} from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, Address } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard, { metaKeyLabel } from "../../keyboard.ts";
import mainEmailStore from "../../stores/emails/main.ts";
import requestStore from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import { IThreadMessage } from "../../stores/thread.ts";
import threadStore from "../../stores/thread.ts";
import { trackEvent } from "../../util/analytics.ts";
import { stopEventPropagation } from "../../util/element.ts";
import {
  AddressOption,
  ReplyRecipients,
  buildQuotedContent,
  buildReplyRecipients,
  getAccountContactOptions,
  hasReplyAllRecipients,
  prependIfNotPresent,
} from "../../util/send.ts";
import { formatAddress } from "../../util/string.ts";
import Tooltip from "../Tooltip.tsx";
import ContactSelect from "../send/ContactSelect.tsx";
import EditorToolButtons from "../send/EditorToolButtons.tsx";
import SquireEditor, {
  SquireEditorApi,
  SquireFormatStates,
  buildComposeContent,
  defaultFormatStates,
} from "../send/SquireEditor.tsx";

export type Mode = "reply" | "reply-all" | "forward";

interface IQuickReplyProps {
  latestMessage: IThreadMessage;
}

interface IQuickReplyState {
  expanded: boolean;
  mode: Mode;
  html: string;
  to: AddressOption[];
  attachments: SendAttachment[];
  isLoadingAttachments: boolean;
  isSending: boolean;
  isSentOrSaved?: boolean;
  formatStates: SquireFormatStates;
}

export default class QuickReply extends React.Component<IQuickReplyProps, IQuickReplyState> {
  private releaseKeyboard: (() => void) | null = null;
  private editorApi: SquireEditorApi | null = null;

  constructor(props: IQuickReplyProps) {
    super(props);
    this.state = {
      expanded: false,
      mode: "reply",
      html: "",
      to: [],
      attachments: [],
      isLoadingAttachments: false,
      isSending: false,
      formatStates: defaultFormatStates,
    };
  }

  componentDidMount() {
    keyboard.quickReply = this;
  }

  componentDidUpdate(_prevProps: IQuickReplyProps, prevState: IQuickReplyState) {
    if (this.state.expanded && !prevState.expanded) {
      this.suspendKeyboard();
    } else if (!this.state.expanded && prevState.expanded) {
      this.resumeKeyboard();
    }
  }

  componentWillUnmount() {
    if (keyboard.quickReply === this) {
      keyboard.quickReply = null;
    }
    this.resumeKeyboard();
  }

  suspendKeyboard() {
    if (!this.releaseKeyboard) {
      this.releaseKeyboard = keyboard.suspend("QuickReply");
      document.addEventListener("keydown", this.handleKeyDown);
    }
  }

  resumeKeyboard() {
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
      document.removeEventListener("keydown", this.handleKeyDown);
    }
  }

  getAccount(): AccountSettings | undefined {
    return _.find(
      settingsStore.props.accounts,
      a => a.id === this.props.latestMessage.accountID,
    );
  }

  getFromAddress(): Address | null {
    const account = this.getAccount();
    if (!account) {
      return null;
    }
    return getAccountContactOptions(account)[0].value[1];
  }

  // The reply/forward body the editor is mounted with: an empty line to type
  // on, the account signature, then the quoted original
  getInitialEditorContent(): string {
    const { latestMessage } = this.props;
    return buildComposeContent(
      "<div><br></div>",
      this.getAccount()?.settings.signature || "",
      buildQuotedContent(latestMessage, latestMessage.body),
    );
  }

  getReplyRecipients(): ReplyRecipients {
    return buildReplyRecipients(
      this.props.latestMessage,
      this.state.mode === "reply-all",
      this.getAccount(),
    );
  }

  canReplyAll(): boolean {
    return hasReplyAllRecipients(this.props.latestMessage, this.getAccount());
  }

  handleExpand = (mode: Mode = "reply") => {
    if (mode === "forward") {
      const { latestMessage } = this.props;
      const hasParts = Boolean(latestMessage.parts && latestMessage.parts.length > 0);

      this.setState({
        expanded: true,
        mode,
        html: this.getInitialEditorContent(),
        to: [],
        attachments: [],
        isLoadingAttachments: hasParts,
      });

      if (hasParts) {
        EmailsService.CreateForwardAttachments(
          latestMessage.accountID,
          latestMessage.folderName,
          latestMessage.uid,
          latestMessage.parts,
        ).then(attachments => {
          if (this.state.expanded && this.state.mode === "forward") {
            // Concat, not replace: the user may have attached their own files
            // while the forwarded parts were downloading
            this.setState({
              attachments: _.concat(this.state.attachments, attachments),
              isLoadingAttachments: false,
            });
          }
        }).catch(e => {
          this.setState({ isLoadingAttachments: false });
          requestStore.addError("Failed to load forwarded attachments", e);
        });
      }
      return;
    }

    const canReplyAll = this.canReplyAll();
    this.setState({
      expanded: true,
      mode: mode === "reply-all" && !canReplyAll ? "reply" : mode,
      html: this.getInitialEditorContent(),
      attachments: [],
      isLoadingAttachments: false,
    });
  };

  handleForward = () => {
    this.handleExpand("forward");
  };

  handleCancel = () => {
    this.setState({
      expanded: false,
      mode: "reply",
      html: "",
      to: [],
      attachments: [],
      isLoadingAttachments: false,
      isSentOrSaved: undefined,
    });
  };

  handleSetMode = (mode: Mode) => {
    this.setState({ mode });
  };

  handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      // Skip if already handled, e.g. react-select closing its menu
      if (ev.defaultPrevented) {
        return;
      }
      // Cancelling resumes the global keyboard synchronously — stop the event
      // reaching its window listener, which would also close the thread.
      ev.stopPropagation();
      this.handleCancel();
    } else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      ev.stopPropagation();
      this.handleSend();
    }
  };

  handleEditorCommand = (command: string, value?: any) => {
    this.editorApi?.command(command, value);
  };

  handleClickAttach = () => {
    EmailsService.CreateSendAttachments().then(attachments => {
      this.setState({ attachments: _.concat(this.state.attachments, attachments) });
    }).catch(e => {
      requestStore.addError("Failed to attach files", e);
    });
  };

  handlePopOut = () => {
    const { latestMessage } = this.props;
    AppService.OpenSendWindow({
      mode: this.state.mode,
      accountID: latestMessage.accountID,
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
        new Error(`No account found for ${latestMessage.accountID}`),
      );
      return;
    }

    const isForward = this.state.mode === "forward";

    if (this.state.isLoadingAttachments) {
      return;
    }

    let to: Address[];
    let cc: Address[] = [];
    if (isForward) {
      to = _.map(this.state.to, option => option.value);
      if (to.length === 0) {
        return;
      }
    } else {
      ({ to, cc } = this.getReplyRecipients());
    }

    const sendOptions: SendOptions = {
      subject: prependIfNotPresent(latestMessage.subject, isForward ? "Fwd" : "Re"),
      html: this.state.html,
      text: "",
      from,
      to,
      cc,
      attachments: this.state.attachments,
      replyingTo: latestMessage,
    };

    this.setState({ isSending: true, isSentOrSaved: undefined });

    const sentBodyHtml = this.state.html;

    EmailsService.SendEmail(latestMessage.accountID, sendOptions).then(sentEmail => {
      trackEvent("QuickReply");
      this.setState({
        isSending: false,
        isSentOrSaved: true,
        html: "",
        to: [],
        attachments: [],
        isLoadingAttachments: false,
        mode: "reply",
        expanded: false,
      });

      if (sentEmail) {
        const newThread = mainEmailStore.injectSentEmail(sentEmail);
        if (newThread) {
          const knownBodies = new Map<string, string>([
            [`${sentEmail.accountID}-${sentEmail.messageId}`, sentBodyHtml],
          ]);
          threadStore.replaceCurrentThread(newThread, knownBodies);
        } else {
          threadStore.reloadThread();
        }
        // The backend emits a sent folder sync, which reconciles the injected
        // email with the real server-side message.
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
    const canReplyAll = this.canReplyAll();
    const deleteOnTrash = keyboard.currentComponent
      ? keyboard.currentComponent.isDeleteOnTrash()
      : Boolean(settingsStore.getAccountSettings(latestMessage.accountID)?.settings.deleteOnTrash);

    return (
      <div className="reply-dock" onClick={stopEventPropagation}>
        <Tooltip position="top" text={<span>Reply (<i className="fa fa-keyboard-o" /> r)</span>}>
          <button
            type="button"
            className="btn-primary lg"
            onClick={() => this.handleExpand("reply")}
          >
            <i className="fa fa-reply"></i> Reply
          </button>
        </Tooltip>
        {canReplyAll && (
          <Tooltip
            position="top"
            text={<span>Reply all (<i className="fa fa-keyboard-o" /> a)</span>}
          >
            <button
              type="button"
              className="btn-ghost"
              onClick={() => this.handleExpand("reply-all")}
            >
              <i className="fa fa-reply-all"></i> Reply all
            </button>
          </Tooltip>
        )}
        <Tooltip position="top" text={<span>Forward (<i className="fa fa-keyboard-o" /> f)</span>}>
          <button
            type="button"
            className="btn-ghost"
            onClick={this.handleForward}
          >
            <i className="fa fa-share"></i> Forward
          </button>
        </Tooltip>
        <span className="spacer"></span>
        <span className="dock-actions">
          <Tooltip position="top" text={<span>Move (<i className="fa fa-keyboard-o" /> m)</span>}>
            <button
              type="button"
              className="icon-ghost"
              onClick={(ev) => keyboard.startMoveCurrentThread(ev)}
            >
              <i className="fa fa-folder-open" />
            </button>
          </Tooltip>
          <Tooltip position="top" text={<span>Archive (<i className="fa fa-keyboard-o" /> enter)</span>}>
            <button
              type="button"
              className="icon-ghost"
              onClick={(ev) => keyboard.archiveCurrentThread(ev)}
            >
              <i className="fa fa-archive" />
            </button>
          </Tooltip>
          <Tooltip
            position="top"
            text={<span>
              {deleteOnTrash ? "Delete permanently" : "Trash"} (<i className="fa fa-keyboard-o" /> backspace)
            </span>}
          >
            <button
              type="button"
              className="icon-ghost danger"
              onClick={(ev) => keyboard.trashCurrentThread(ev)}
            >
              <i className="fa fa-trash" />
            </button>
          </Tooltip>
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
    if (this.state.mode === "forward") {
      return (
        <div className="recipients forward-to">
          <span className="label">To</span>
          <div className="recip">
            <ContactSelect
              id="quick-forward-to"
              value={this.state.to}
              onChange={(to) => this.setState({ to })}
            />
          </div>
        </div>
      );
    }

    const { to, cc } = this.getReplyRecipients();
    const toLabel = to.map(a => formatAddress(a)).join(", ");
    const ccLabel = cc.length > 0 ? cc.map(a => formatAddress(a)).join(", ") : null;

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

  renderModeToggle() {
    if (this.state.mode === "forward") {
      return (
        <div className="mode-toggle">
          <button type="button" className="active" disabled>
            <i className="fa fa-share"></i> Forward
          </button>
        </div>
      );
    }

    return (
      <div className="mode-toggle">
        <button
          type="button"
          className={this.state.mode === "reply" ? "active" : ""}
          onClick={() => this.handleSetMode("reply")}
        >
          <i className="fa fa-reply"></i> Reply
        </button>
        {this.canReplyAll() && (
          <button
            type="button"
            className={this.state.mode === "reply-all" ? "active" : ""}
            onClick={() => this.handleSetMode("reply-all")}
          >
            <i className="fa fa-reply-all"></i> Reply all
          </button>
        )}
      </div>
    );
  }

  renderAttachments() {
    if (this.state.isLoadingAttachments) {
      return (
        <div className="quick-reply-attachments">
          <div className="attachment loading">
            <i className="fa fa-spin fa-refresh" />
            <span>Loading attachments&hellip;</span>
          </div>
        </div>
      );
    }

    if (this.state.attachments.length === 0) {
      return null;
    }

    return (
      <div className="quick-reply-attachments">
        {_.map(this.state.attachments, (attachment, i) => (
          <div
            key={attachment.path}
            className="attachment"
            title="Remove attachment"
            onClick={() => {
              const attachments = [...this.state.attachments];
              attachments.splice(i, 1);
              this.setState({ attachments });
            }}
          >
            <i className="fa fa-file-o" />
            <span>{attachment.filename}</span>
          </div>
        ))}
      </div>
    );
  }

  renderExpanded() {
    const isForward = this.state.mode === "forward";
    const sendClasses = ["submit"];
    if (this.state.isSending) sendClasses.push("disabled");
    if (this.state.isSentOrSaved === false) sendClasses.push("error");

    return (
      <div className="quick-reply expanded" onClick={stopEventPropagation}>
        <div className="quick-reply-header">
          {this.renderModeToggle()}
          <a className="pop-out" onClick={this.handlePopOut} title="Open in full editor">
            <i className="fa fa-external-link"></i> Pop out
          </a>
        </div>

        {this.renderRecipientSummary()}

        <SquireEditor
          key={isForward ? "forward" : "reply"}
          initialContent={this.state.html}
          autoFocus
          onReady={(api) => { this.editorApi = api; }}
          onFormatStateChange={(states) => this.setState({ formatStates: states })}
          onUpdate={(data) => this.setState({ html: data })}
        />

        {this.renderAttachments()}

        <div className="quick-reply-actions">
          <Tooltip
            position="top"
            text={<span>Send (<i className="fa fa-keyboard-o" /> {metaKeyLabel}+enter)</span>}
          >
            <button
              type="button"
              className={sendClasses.join(" ")}
              onClick={this.handleSend}
              disabled={
                this.state.isSending
                || this.state.isLoadingAttachments
                || (isForward && this.state.to.length === 0)
              }
            >
              {this.renderSendButtonContent()}
            </button>
          </Tooltip>
          <div className="vrule" />
          <button
            type="button"
            className="tool-btn"
            title="Attach"
            onClick={this.handleClickAttach}
          >
            <i className="fa fa-paperclip" />
          </button>
          <EditorToolButtons
            formatStates={this.state.formatStates}
            onCommand={this.handleEditorCommand}
          />
          <span className="spacer" />
          <Tooltip
            position="top"
            text={<span>Cancel (<i className="fa fa-keyboard-o" /> esc)</span>}
          >
            <button
              type="button"
              className="cancel"
              onClick={this.handleCancel}
              disabled={this.state.isSending}
            >
              Cancel
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  render() {
    return this.state.expanded ? this.renderExpanded() : this.renderCollapsed();
  }
}
