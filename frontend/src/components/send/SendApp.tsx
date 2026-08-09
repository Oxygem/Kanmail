import _ from "lodash";
import React from "react";
import Select from "react-select";

import {
  SendAttachment,
  SendOptions,
} from "../../../bindings/github.com/oxygem/kanmail/internal/emails/models.ts";
import {
  EmailsService,
} from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { Address, type Email } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard, { metaKeyLabel } from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import requestStore from "../../stores/request.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import systemStore, { ISystem } from "../../stores/system.ts";
import { trackEvent } from "../../util/analytics.ts";
import { stopEventPropagation } from "../../util/element.ts";
import {
  AccountAddressOption,
  AddressOption,
  buildReplyRecipients,
  getAccountContactOptions,
  prependIfNotPresent,
  stringToColor,
  toAddressOptions,
} from "../../util/send.ts";
import { makeDragElement } from "../../window.ts";
import LicensePurchase from "../LicensePurchase.tsx";
import Tooltip from "../Tooltip.tsx";
import ContactSelect from "./ContactSelect.tsx";
import EditorToolButtons from "./EditorToolButtons.tsx";
import SquireEditor, {
  buildComposeContent,
  defaultFormatStates,
  SquireEditorApi,
  SquireFormatStates,
} from "./SquireEditor.tsx";

type addressOption = AddressOption;

type accountAddressOption = AccountAddressOption;

interface ISendAppProps extends ISettings, ISystem {
  // Message we're replying to, if any
  message?: Email;
  messageContent?: string;
  quotedContent?: string;
  mode?: string;

  // Complete editor HTML from a popped-out quick reply — used as-is, since it
  // already contains the reply, signature and quote
  completeContent?: string;
  // Attachments already prepared by the quick reply; non-null means use
  // exactly these instead of re-collecting forwarded parts
  attachments?: SendAttachment[];

  // Prefilled fields, used when there's no message to reply to (or, for to,
  // when popping out a partially-composed forward)
  to?: string[];
  subject?: string;
}

interface ISendAppState {
  accountContact: accountAddressOption;

  to: addressOption[];
  cc: addressOption[];

  subject: string;
  html: string;
  text: string;

  attachments: SendAttachment[];

  isLoadingAttachments: boolean;
  isSending: boolean;
  isSaving: boolean;
  isSentOrSaved?: boolean;
  showPurchaseUpsell?: boolean;

  showCc: boolean;
  formatStates: SquireFormatStates;
}

@subscribe(settingsStore, systemStore)
export default class SendApp extends React.Component<ISendAppProps, ISendAppState> {
  private releaseKeyboard: (() => void) | null = null;
  private editorApi: SquireEditorApi | null = null;

  constructor(props: ISendAppProps) {
    super(props);


    const defaultAccount = getAccountContactOptions(props.accounts[0])[0];

    const state: ISendAppState = {
      accountContact: defaultAccount,

      to: [],
      cc: [],

      subject: "",

      html: "",
      text: "",

      attachments: [],

      // "Hidden"/uneditable fields
      // replyToMessageId: null,
      // replyToMessageReferences: null,
      // replyToQuoteHtml: null,

      isLoadingAttachments: false,
      isSending: false,
      isSaving: false,

      showCc: false,
      formatStates: defaultFormatStates,
    };

    if (props.message) {
      // Figure out subject
      let subject = props.message.subject;
      if (props.mode === "forward") {
        subject = prependIfNotPresent(subject, "Fwd");
      } else {
        subject = prependIfNotPresent(subject, "Re");
      }
      state.subject = subject;

      const account = _.find(
        props.accounts,
        (account) => account.id === props.message!.accountID
      );
      if (account) {
        state.accountContact = getAccountContactOptions(account)[0];
      }

      if (props.mode !== "forward") {
        const { to, cc } = buildReplyRecipients(
          props.message,
          props.mode === "reply-all",
          account,
        );
        state.to = toAddressOptions(to);
        state.cc = toAddressOptions(cc);
        if (cc.length > 0) {
          state.showCc = true;
        }
      } else if (props.to?.length) {
        state.to = toAddressOptions(
          props.to.map(email => new Address({ name: "", email })),
        );
      }
    } else {
      if (props.subject) {
        state.subject = props.subject;
      }
      if (props.to?.length) {
        state.to = toAddressOptions(
          props.to.map(email => new Address({ name: "", email })),
        );
      }
    }


    if (props.attachments) {
      state.attachments = props.attachments;
    }

    // Seed the body with what the editor will be mounted with, so sending
    // without typing still includes the signature and the quote
    state.html = this.buildEditorContent(state.accountContact.value[0]);

    this.state = state;
  }

  componentDidMount() {
    this.releaseKeyboard = keyboard.suspend("SendApp");
    document.addEventListener("keydown", this.handleKeyDown);

    const { message, mode } = this.props;
    if (
      mode === "forward"
      && !this.props.attachments
      && message && message.parts && message.parts.length > 0
    ) {
      this.setState({ isLoadingAttachments: true });
      EmailsService.CreateForwardAttachments(
        message.accountID,
        message.folderName,
        message.uid,
        message.parts,
      ).then(attachments => {
        this.setState({
          attachments: _.concat(this.state.attachments, attachments),
          isLoadingAttachments: false,
        });
      }).catch(e => {
        this.setState({ isLoadingAttachments: false });
        requestStore.addError("Failed to load forwarded attachments", e);
      });
    }
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleKeyDown);
    if (this.releaseKeyboard) {
      this.releaseKeyboard();
      this.releaseKeyboard = null;
    }
  }

  handleKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
      this.handleSendEmail(ev);
    }
  };

  handleInputChange = (field: keyof ISendAppState, ev) => {
    this.setState({
      ...this.state,
      [field]: ev.target.value,
    });
  };

  handleAccountChange = (option: accountAddressOption) => {
    const previousAccountID = this.state.accountContact.value[0];
    this.setState({ accountContact: option });

    // Accounts can have several contacts, and those share a signature
    const accountID = option.value[0];
    if (accountID !== previousAccountID) {
      this.editorApi?.setSignature(this.getSignatureHtml(accountID));
    }
  };

  handleSendEmail = (ev) => {
    ev.preventDefault();

    if (this.state.isSending || this.state.isSaving || this.state.isLoadingAttachments) {
      return;
    }

    this.setState({ isSending: true, isSentOrSaved: undefined });

    const sendOptions: SendOptions = {
      subject: this.state.subject,
      html: this.state.html,
      text: this.state.text,
      from: this.state.accountContact.value[1],
      to: _.map(this.state.to, opt => opt.value),
      cc: _.map(this.state.cc, opt => opt.value),
      attachments: this.state.attachments,
      replyingTo: this.props.message,
    };

    EmailsService.SendEmail(this.state.accountContact.value[0], sendOptions).then(() => {
      trackEvent("SendEmail");
      if (this.props.isLicensed) {
        this.setState({ isSentOrSaved: true });
        // @ts-ignore
        setTimeout(() => wails.Window.Close(), 1000);
      } else {
        // Instead of closing, pitch a license purchase
        this.setState({ isSentOrSaved: true, showPurchaseUpsell: true });
      }
    }).catch(e => {
      // Reset isSending so the user can fix the problem and retry, rather than
      // being stuck with Cancel (which discards the message) as the only exit
      this.setState({ isSending: false, isSentOrSaved: false })
      trackEvent("SendEmailFailed", {
        error: e?.message,
        isNetwork: Boolean(e?.cause?.isNetwork),
      });
      requestStore.addError("Failed to send email", e);
    })
  };

  handleClickAttach = (ev) => {
    EmailsService.CreateSendAttachments().then(attachments => {
      this.setState({
        attachments: _.concat(this.state.attachments, attachments),
      })
    })
  };

  getSignatureHtml(accountID: string): string {
    const account = _.find(this.props.accounts, (account) => account.id === accountID);
    return account?.settings.signature || "";
  }

  buildEditorContent(accountID: string): string {
    if (this.props.completeContent) {
      return this.props.completeContent;
    }

    // Always open on something to type into above the signature, so autoFocus
    // doesn't drop the cursor inside the signature itself
    const body = this.props.messageContent || "<div><br></div>";

    return buildComposeContent(
      body,
      this.getSignatureHtml(accountID),
      this.props.quotedContent || "",
    );
  }

  handleEditorCommand = (command: string, value?: any) => {
    if (this.editorApi) {
      this.editorApi.command(command, value);
    }
  };

  // The gradient primary action, reflecting the dynamic send states.
  renderSendButton() {
    let icon = "fa fa-paper-plane";
    let label = "Send";

    if (this.state.isSentOrSaved === true) {
      icon = "fa fa-check";
      label = "Sent!";
    } else if (this.state.isSentOrSaved === false) {
      icon = "fa fa-times";
      label = "Error sending!";
    } else if (this.state.isSending) {
      icon = "fa fa-spin fa-refresh";
      label = "Sending";
    }

    return (
      <Tooltip
        position="top"
        text={<span>Send (<i className="fa fa-keyboard-o" /> {metaKeyLabel}+enter)</span>}
      >
        <button className="btn-primary" onClick={this.handleSendEmail}>
          <i className={icon} /> {label}
        </button>
      </Tooltip>
    );
  }

  // Renders the account dot + name + email inside the From react-select control.
  formatAccountOptionLabel = (option: accountAddressOption) => {
    const accountID = option.value[0];
    const addr = option.value[1];
    const accountName = settingsStore.getAccountSettings(accountID)?.name || accountID;
    return (
      <span className="from-pill-label">
        <span className="dot" style={{ background: stringToColor(accountName) }} />
        <span className="nm">{addr.name || accountName}</span>
        {addr.email && <span className="em">{addr.email}</span>}
      </span>
    );
  };

  renderPurchaseUpsell() {
    return (
      <div className="sent-upsell">
        <div className="sent-head">
          <h2><i className="fa fa-check" /> Email sent!</h2>
          <p>
            Kanmail is free to evaluate — a license unlocks it forever and
            supports future development.
          </p>
        </div>
        <LicensePurchase />
        <button
          type="button"
          className="btn-cancel"
          // @ts-ignore
          onClick={() => wails.Window.Close()}
        >
          Close window
        </button>
      </div>
    );
  }

  render() {
    const accountOptions: accountAddressOption[] = _.reduce(
      this.props.accounts,
      (memo, account) => {
        return _.concat(memo, getAccountContactOptions(account))
      },
      []
    );

    const { formatStates } = this.state;

    return (
      <section
        id="new-email"
      >
        <header
          className="new-email titlebar"
          onClick={stopEventPropagation}
          ref={makeDragElement}
        >
          <span className="title">
            <i className="fa fa-pencil" /> New Message
          </span>
          <div className="header-errors-anchor"></div>
        </header>

        {this.state.showPurchaseUpsell ? this.renderPurchaseUpsell() : <form
          id="send-form"
          className="flex flex-vertical flex-nowrap"
          // Prevent button clicks submitting the form
          onSubmit={(ev) => ev.preventDefault()}
        >
          <div className="form-top" onClick={stopEventPropagation}>
            <div className="field" id="field-from">
              <span className="lbl">From</span>
              <Select
                id="account"
                classNamePrefix="react-select"
                options={accountOptions}
                value={this.state.accountContact}
                formatOptionLabel={this.formatAccountOptionLabel}
                onChange={(v) => this.handleAccountChange(v as accountAddressOption)}
              />
            </div>

            <div className="field" id="field-to">
              <span className="lbl">To</span>
              <div className="recip">
                <ContactSelect
                  id="to"
                  value={this.state.to}
                  onChange={(to) => this.setState({ to })}
                />
              </div>
              {!this.state.showCc && (
                <span className="cc">
                  <span onClick={() => this.setState({ showCc: true })}>Cc</span>
                </span>
              )}
            </div>

            {this.state.showCc && (
              <div className="field" id="field-cc">
                <span className="lbl">Cc</span>
                <div className="recip">
                  <ContactSelect
                    id="cc"
                    value={this.state.cc}
                    onChange={(cc) => this.setState({ cc })}
                  />
                </div>
              </div>
            )}

            <div className="field" id="field-subject">
              <label className="lbl" htmlFor="subject">Subject</label>
              <input
                id="subject"
                type="text"
                className="subject-val"
                value={this.state.subject}
                onChange={_.partial(this.handleInputChange, "subject")}
              />
            </div>
          </div>

          <div className="compose-body form-content" onClick={stopEventPropagation}>
            <SquireEditor
              initialContent={this.state.html}
              autoFocus
              onReady={(api) => { this.editorApi = api; }}
              onFormatStateChange={(states) => this.setState({ formatStates: states })}
              onUpdate={data => {
                this.setState({
                  html: data,
                })
              }}
            />
          </div>

          <div className={`form-attachments ${this.state.attachments.length === 0 && !this.state.isLoadingAttachments ? "empty" : ""
            }`}>
            {this.state.isLoadingAttachments && (
              <div className="attachment loading">
                <i className="fa fa-spin fa-refresh" />
                <div>
                  <span>Loading attachments&hellip;</span>
                </div>
              </div>
            )}
            {_.map(this.state.attachments, (attachment, i) => (
              <div className="attachment" onClick={() => {
                const attachments = this.state.attachments;
                attachments.splice(i, 1);
                this.setState({ attachments })
              }}>
                <i className="fa fa-file-o" />
                <div>
                  <span>{attachment.filename}</span>
                  <span>{attachment.contentType}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="compose-dock" onClick={stopEventPropagation}>
            {this.renderSendButton()}
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
              formatStates={formatStates}
              onCommand={this.handleEditorCommand}
            />
            <span className="spacer" />
            <Tooltip position="top" text="Discard message and close">
              <button
                type="button"
                className="btn-cancel"
                // @ts-ignore
                onClick={() => wails.Window.Close()}
              >
                Cancel
              </button>
            </Tooltip>
          </div>
        </form>}
      </section>
    );
  }
}
