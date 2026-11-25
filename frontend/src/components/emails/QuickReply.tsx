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
import threadStore, { IThreadMessage } from "../../stores/thread.ts";
import { trackEvent } from "../../util/analytics.ts";
import { stopEventPropagation } from "../../util/element.ts";
import { restoreRemoteImages } from "../../util/html.ts";
import {
  AccountAddressOption,
  AddressOption,
  ReplyRecipients,
  buildQuotedContent,
  buildReplyRecipients,
  getAccountContactOptions,
  hasReplyAllRecipients,
  prependIfNotPresent,
  toAddressOptions,
} from "../../util/send.ts";
import { formatAddress, joinNames } from "../../util/string.ts";
import Icon, { IconName } from "../Icon.tsx";
import PopoverMenu, { MenuItem } from "../PopoverMenu.tsx";
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

const MODES: { mode: Mode, label: string, icon: IconName }[] = [
  { mode: "reply", label: "Reply", icon: "reply" },
  { mode: "reply-all", label: "Reply all", icon: "reply-all" },
  { mode: "forward", label: "Forward", icon: "forward" },
];

interface IQuickReplyProps {
  latestMessage: IThreadMessage;
}

interface IQuickReplyState {
  expanded: boolean;
  mode: Mode;
  html: string;
  to: AddressOption[];
  cc: AddressOption[];
  bcc: AddressOption[];
  showCc: boolean;
  showBcc: boolean;
  recipientsEdited: boolean;
  fromIndex: number;
  attachments: SendAttachment[];
  forwardedAttachmentPaths: string[];
  isLoadingAttachments: boolean;
  isSending: boolean;
  isSentOrSaved?: boolean;
  showFormatting: boolean;
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
      cc: [],
      bcc: [],
      showCc: false,
      showBcc: false,
      recipientsEdited: false,
      fromIndex: 0,
      attachments: [],
      forwardedAttachmentPaths: [],
      isLoadingAttachments: false,
      isSending: false,
      showFormatting: false,
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

  getFromOptions(): AccountAddressOption[] {
    const account = this.getAccount();
    return account ? getAccountContactOptions(account) : [];
  }

  getFromAddress(): Address | null {
    const options = this.getFromOptions();
    return (options[this.state.fromIndex] || options[0])?.value[1] || null;
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

  getReplyRecipients(mode: Mode): ReplyRecipients {
    return buildReplyRecipients(
      this.props.latestMessage,
      mode === "reply-all",
      this.getAccount(),
    );
  }

  canReplyAll(): boolean {
    return hasReplyAllRecipients(this.props.latestMessage, this.getAccount());
  }

  getDefaultMode(): Mode {
    return this.canReplyAll() ? "reply-all" : "reply";
  }

  getRecipientState(mode: Mode): Pick<IQuickReplyState, "to" | "cc" | "showCc" | "recipientsEdited"> {
    if (mode === "forward") {
      return { to: [], cc: [], showCc: false, recipientsEdited: false };
    }
    const { to, cc } = this.getReplyRecipients(mode);
    return {
      to: toAddressOptions(to),
      cc: toAddressOptions(cc),
      showCc: cc.length > 0,
      recipientsEdited: false,
    };
  }

  loadForwardedAttachments() {
    const { latestMessage } = this.props;
    if (!latestMessage.parts || latestMessage.parts.length === 0) {
      return;
    }

    this.setState({ isLoadingAttachments: true });

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
          forwardedAttachmentPaths: _.map(attachments, attachment => attachment.path),
          isLoadingAttachments: false,
        });
      }
    }).catch(e => {
      this.setState({ isLoadingAttachments: false });
      requestStore.addError("Failed to load forwarded attachments", e);
    });
  }

  handleExpand = (mode: Mode = this.getDefaultMode()) => {
    if (mode === "reply-all" && !this.canReplyAll()) {
      mode = "reply";
    }

    this.setState({
      expanded: true,
      mode,
      html: this.getInitialEditorContent(),
      ...this.getRecipientState(mode),
      bcc: [],
      showBcc: false,
      fromIndex: 0,
      attachments: [],
      forwardedAttachmentPaths: [],
      isLoadingAttachments: false,
    }, () => {
      if (mode === "forward") {
        this.loadForwardedAttachments();
      }
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
      cc: [],
      bcc: [],
      showCc: false,
      showBcc: false,
      attachments: [],
      forwardedAttachmentPaths: [],
      isLoadingAttachments: false,
      isSentOrSaved: undefined,
      showFormatting: false,
    });
  };

  handleSetMode = (mode: Mode) => {
    if (mode === this.state.mode) {
      return;
    }

    const attachments = _.filter(
      this.state.attachments,
      attachment => !_.includes(this.state.forwardedAttachmentPaths, attachment.path),
    );

    this.setState({
      mode,
      ...this.getRecipientState(mode),
      attachments,
      forwardedAttachmentPaths: [],
      isLoadingAttachments: false,
    }, () => {
      if (mode === "forward") {
        this.loadForwardedAttachments();
      }
    });
  };

  setRecipients(field: "to" | "cc" | "bcc", value: AddressOption[]) {
    this.setState({ [field]: value, recipientsEdited: true } as Pick<IQuickReplyState, typeof field | "recipientsEdited">);
  }

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
    const emails = (options: AddressOption[]) => _.map(options, option => option.value.email);
    const carryRecipients = this.state.mode === "forward" || this.state.recipientsEdited;

    AppService.OpenSendWindow({
      mode: this.state.mode,
      accountID: latestMessage.accountID,
      folderName: latestMessage.folderName,
      uid: latestMessage.uid,
      subject: prependIfNotPresent(
        latestMessage.subject,
        this.state.mode === "forward" ? "Fwd" : "Re",
      ),
      body: this.state.html,
      to: carryRecipients ? emails(this.state.to) : [],
      cc: carryRecipients ? emails(this.state.cc) : [],
      bcc: emails(this.state.bcc),
      // While forwarded parts are still downloading pass nothing, letting the
      // full editor re-collect them itself
      attachments: this.state.isLoadingAttachments
        ? undefined
        : this.state.attachments,
    }).then(() => {
      // Only discard the quick reply once the send window actually opened -
      // wiping it first would lose the typed reply if the open fails
      this.handleCancel();
    }).catch((e) => {
      requestStore.addError("Failed to open send window", e);
    });
  };

  canSend(): boolean {
    return !this.state.isSending && !this.state.isLoadingAttachments && this.state.to.length > 0;
  }

  handleSend = () => {
    if (!this.canSend()) {
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
    const addresses = (options: AddressOption[]) => _.map(options, option => option.value);

    const sendOptions: SendOptions = {
      subject: prependIfNotPresent(latestMessage.subject, isForward ? "Fwd" : "Re"),
      html: restoreRemoteImages(this.state.html),
      text: "",
      from,
      to: addresses(this.state.to),
      cc: addresses(this.state.cc),
      bcc: addresses(this.state.bcc),
      attachments: this.state.attachments,
      replyingTo: latestMessage,
    };

    this.setState({ isSending: true, isSentOrSaved: undefined });

    const sentBodyHtml = this.state.html;

    EmailsService.SendEmail(latestMessage.accountID, sendOptions).then(sentEmail => {
      trackEvent("QuickReply");
      this.handleCancel();
      this.setState({ isSending: false, isSentOrSaved: true });

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

  getPlaceholder(mode: Mode): string {
    const { to, cc } = this.getReplyRecipients(mode);
    const names = _.uniq(_.map(_.concat(to, cc), address => formatAddress(address, true)));
    const label = mode === "reply-all" ? "Reply all" : "Reply";
    return names.length > 0 ? `${label} to ${joinNames(names)}…` : `${label}…`;
  }

  renderCollapsed() {
    const mode = this.getDefaultMode();
    const shortcut = mode === "reply-all" ? "a" : "r";

    return (
      <div className="reply-dock" onClick={stopEventPropagation}>
        <Tooltip position="top" text={<span>{mode === "reply-all" ? "Reply all" : "Reply"} (<i className="fa fa-keyboard-o" /> {shortcut})</span>}>
          <button
            type="button"
            className="reply-field"
            onClick={() => this.handleExpand(mode)}
          >
            <Icon name={mode} />
            <span>{this.getPlaceholder(mode)}</span>
          </button>
        </Tooltip>
        <Tooltip position="top" text={<span>Forward (<i className="fa fa-keyboard-o" /> f)</span>}>
          <button
            type="button"
            className="forward-btn"
            onClick={this.handleForward}
          >
            <Icon name="forward" />
            Forward
          </button>
        </Tooltip>
      </div>
    );
  }

  renderModeMenu() {
    const current = _.find(MODES, { mode: this.state.mode })!;
    const modes = _.filter(MODES, ({ mode }) => mode !== "reply-all" || this.canReplyAll());

    return (
      <PopoverMenu
        triggerClassName="mode-btn"
        align="left"
        trigger={<>
          <Icon name={current.icon} size={16} />
          {current.label}
          <Icon name="chevron-down" size={14} className="chevron" />
        </>}
      >
        {(close) => _.map(modes, ({ mode, label, icon }) => (
          <MenuItem
            key={mode}
            icon={icon}
            label={label}
            active={mode === this.state.mode}
            close={close}
            onClick={() => this.handleSetMode(mode)}
          />
        ))}
      </PopoverMenu>
    );
  }

  renderRecipientRow(field: "cc" | "bcc", label: string) {
    return (
      <div className="composer-row">
        <span className="label">{label}</span>
        <div className="recip">
          <ContactSelect
            id={`quick-reply-${field}`}
            compact
            value={this.state[field]}
            onChange={(value) => this.setRecipients(field, value)}
          />
        </div>
      </div>
    );
  }

  renderRecipients() {
    return (
      <>
        <div className="composer-row composer-top">
          {this.renderModeMenu()}
          <span className="label">to</span>
          <div className="recip">
            <ContactSelect
              id="quick-reply-to"
              compact
              value={this.state.to}
              onChange={(to) => this.setRecipients("to", to)}
            />
          </div>
          {!this.state.showCc && (
            <button type="button" className="text-btn" onClick={() => this.setState({ showCc: true })}>Cc</button>
          )}
          {!this.state.showBcc && (
            <button type="button" className="text-btn" onClick={() => this.setState({ showBcc: true })}>Bcc</button>
          )}
        </div>
        {this.state.showCc && this.renderRecipientRow("cc", "cc")}
        {this.state.showBcc && this.renderRecipientRow("bcc", "bcc")}
      </>
    );
  }

  renderAttachments() {
    if (!this.state.isLoadingAttachments && this.state.attachments.length === 0) {
      return null;
    }

    return (
      <div className="composer-attachments">
        {this.state.isLoadingAttachments && (
          <div className="attachment loading">
            <Icon name="loader" size={14} className="spin" />
            <span>Loading attachments&hellip;</span>
          </div>
        )}
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
            <Icon name="paperclip" size={14} />
            <span>{attachment.filename}</span>
          </div>
        ))}
      </div>
    );
  }

  renderFrom() {
    const options = this.getFromOptions();
    const from = this.getFromAddress();
    if (!from) {
      return null;
    }

    const color = settingsStore.getAccountAccentColor(this.props.latestMessage.accountID) || "var(--faint)";
    const label = <><i className="dot" style={{ background: color }} />{from.email}</>;

    if (options.length < 2) {
      return <span className="from">{label}</span>;
    }

    return (
      <PopoverMenu triggerClassName="from" placement="above" trigger={label}>
        {(close) => _.map(options, (option, i) => (
          <MenuItem
            key={option.label}
            label={option.label}
            active={i === this.state.fromIndex}
            close={close}
            onClick={() => this.setState({ fromIndex: i })}
          />
        ))}
      </PopoverMenu>
    );
  }

  renderSendButtonContent() {
    if (this.state.isSending) {
      return <>Sending <Icon name="loader" size={16} className="spin" /></>;
    }
    if (this.state.isSentOrSaved === false) {
      return <>Retry <Icon name="send" size={16} /></>;
    }
    return <>Send <Icon name="send" size={16} /></>;
  }

  renderExpanded() {
    const sendClasses = ["send-btn"];
    if (this.state.isSentOrSaved === false) {
      sendClasses.push("error");
    }

    return (
      <div className="composer" onClick={stopEventPropagation}>
        {this.renderRecipients()}

        <SquireEditor
          key={this.state.mode === "forward" ? "forward" : "reply"}
          initialContent={this.state.html}
          autoFocus
          onReady={(api) => { this.editorApi = api; }}
          onFormatStateChange={(states) => this.setState({ formatStates: states })}
          onUpdate={(data) => this.setState({ html: data })}
        />

        {this.renderAttachments()}

        {this.state.showFormatting && (
          <div className="composer-formatting">
            <EditorToolButtons
              formatStates={this.state.formatStates}
              onCommand={this.handleEditorCommand}
            />
          </div>
        )}

        <div className="composer-actions">
          <button type="button" className="tool-btn" title="Attach files" onClick={this.handleClickAttach}>
            <Icon name="paperclip" />
          </button>
          <button
            type="button"
            className={`tool-btn${this.state.showFormatting ? " active" : ""}`}
            title="Formatting"
            onClick={() => this.setState({ showFormatting: !this.state.showFormatting })}
          >
            <Icon name="type" />
          </button>
          <PopoverMenu
            triggerClassName="tool-btn"
            title="More"
            align="left"
            placement="above"
            trigger={<Icon name="more" />}
          >
            {(close) => (
              <MenuItem icon="external-link" label="Open in full editor" close={close} onClick={this.handlePopOut} />
            )}
          </PopoverMenu>
          <span className="spacer" />
          {this.renderFrom()}
          <Tooltip position="top" text={<span>Discard (<i className="fa fa-keyboard-o" /> esc)</span>}>
            <button
              type="button"
              className="tool-btn discard"
              onClick={this.handleCancel}
              disabled={this.state.isSending}
            >
              <Icon name="trash" />
            </button>
          </Tooltip>
          <Tooltip
            position="top"
            text={<span>Send (<i className="fa fa-keyboard-o" /> {metaKeyLabel}+enter)</span>}
          >
            <button
              type="button"
              className={sendClasses.join(" ")}
              onClick={this.handleSend}
              disabled={!this.canSend()}
            >
              {this.renderSendButtonContent()}
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
