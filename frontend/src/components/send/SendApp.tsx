import { Editor } from "@tiptap/core";
import _ from "lodash";
import PropTypes from "prop-types";
import React from "react";
import Select from "react-select";
import AsyncCreatableSelect from "react-select/async-creatable";

import {
  SendAttachment,
  SendOptions,
} from "../../../bindings/github.com/oxygem/kanmail/internal/emails/models.ts";
import {
  ContactsService,
  EmailsService,
} from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import type { Email } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import {
  AccountSettings,
  Address,
} from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import { stopEventPropagation } from "../../util/element.ts";
import { formatAddress } from "../../util/string.js";
import { closeWindow, makeDragElement } from "../../window.ts";
// import EditorSimple from "../EditorSimple.jsx";
import ControlInput from "../emails/ControlInput.tsx";
import SquireEditor from "./SquireEditor.tsx";

interface addressOption {
  value: Address,
  label: string,
}

interface accountAddressOption {
  value: [_: string, _: Address],
  label: string,
}

function getAccountContactOptions(account: AccountSettings): accountAddressOption[] {
  if (account.contacts && account.contacts.length > 0) {
    return account.contacts.map(addr => ({
      value: [account.name, addr],
      label: formatAddress(addr),
    }))
  }

  const addr = new Address({
    name: "",
    email: account.smtpSettings.username,
  })

  return [{
    value: [account.name, addr],
    label: formatAddress(addr),
  }]
}

function prependIfNotPresent(prependTo, prependString) {
  if (
    prependTo.startsWith(prependString) ||
    prependTo.startsWith(prependString.toLowerCase()) ||
    prependTo.startsWith(prependString.toUpperCase())
  ) {
    return prependTo;
  }
  return `${prependString}: ${prependTo}`;
}

function getFilename(path) {
  const bits = path.split("/");
  return bits[bits.length - 1];
}

interface ISendAppProps extends ISettings {
  // Message we're replying to, if any
  message?: Email;
  messageContent?: string;
  mode?: string;
}

interface ISendAppState {
  accountContact: accountAddressOption;

  to: addressOption[];
  cc: addressOption[];

  subject: string;
  html: string;
  text: string;

  attachments: SendAttachment[];

  isSending: boolean;
  isSaving: boolean;
  isSentOrSaved?: boolean;
}

@subscribe(settingsStore)
export default class SendApp extends React.Component<ISendAppProps, ISendAppState> {
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

      // selectedSignatureIdx: -1,
      // signatureHtml: null,
      // signatureText: null,

      isSending: false,
      isSaving: false,
    };

    if (props.message) {
      console.log("MODE", props);
      // Figure out subject
      let subject = props.message.subject;
      if (props.mode === "forward") {
        subject = prependIfNotPresent(subject, "Fwd");
      } else {
        subject = prependIfNotPresent(subject, "Re");
      }
      state.subject = subject;

      const accountIndex = _.findIndex(
        this.props.accounts,
        (account) => account.name === props.message!.accountName
      );
      if (accountIndex > 0) {
        const account = props.accounts[accountIndex];
        state.accountContact = getAccountContactOptions(account)[0];
      }

      if (props.mode !== "forward") {
        const to: addressOption[] = [];
        _.each(props.message.replyTo, address => {
          to.push({
            value: address,
            label: formatAddress(address),
          })
        })
        state.to = to;
      }

      if (props.mode === "reply-all") {
        const cc: addressOption[] = [];
        _.each(props.message.cc, address => {
          cc.push({
            value: address,
            label: formatAddress(address),
          })
        })
        state.cc = cc
      }
    }


    this.state = state;
  }

  handleInputChange = (field: keyof ISendAppState, ev) => {
    this.setState({
      ...this.state,
      [field]: ev.target.value,
    });
  };

  handleSelectChange = (field: keyof ISendAppState, item: any) => {
    this.setState({
      ...this.state,
      [field]: item,
    });
  };

  handleSendEmail = (ev) => {
    ev.preventDefault();

    if (this.state.isSending || this.state.isSaving) {
      return;
    }

    this.setState({ isSending: true });

    const sendOptions: SendOptions = {
      subject: this.state.subject,
      html: this.state.html,
      text: this.state.text,
      from: this.state.accountContact.value[1],
      to: _.map(this.state.to, opt => opt.value),
      cc: _.map(this.state.cc, opt => opt.value),
      attachments: this.state.attachments,
    };

    EmailsService.SendEmail(this.state.accountContact.value[0], sendOptions).then(() => {
      this.setState({ isSentOrSaved: true })
      // @ts-ignore
      setTimeout(() => wails.Window.Close(), 1000);
    }).catch(e => {
      this.setState({ isSentOrSaved: false })
      throw e
    })
  };

  handleClickAttach = (ev) => {
    EmailsService.CreateSendAttachments().then(attachments => {
      this.setState({
        attachments: _.concat(this.state.attachments, attachments),
      })
    })
  };

  renderContactsSelect(dataKey) {
    const loadOptions = async (inputValue: string): Promise<addressOption[]> => {
      const addrs = await ContactsService.SearchContacts(inputValue);
      return _.map(addrs, (addr) => {
        return {
          value: addr,
          label: formatAddress(addr),
        }
      })
    };

    return (
      <AsyncCreatableSelect
        isMulti
        cacheOptions
        defaultOptions
        loadOptions={loadOptions}
        id={dataKey}
        classNamePrefix="react-select"
        value={this.state[dataKey]}
        onChange={_.partial(this.handleSelectChange, dataKey)}
        onCreateOption={(value: string) => {
          const v = {
            label: value,
            value: new Address({
              name: "",
              email: value,
            })
          }
          // @ts-ignore
          this.setState({
            [dataKey]: [...this.state[dataKey], v],
          })
        }}
      />
    );
  }

  renderAttachLink() {
    if (this.state.isSending) {
      return null;
    }

    return <a onClick={this.handleClickAttach}>
      <span>
        <i className="fa fa-file" /> Attach
      </span>
    </a>;
  }

  renderSendLink() {
    if (this.state.isSentOrSaved === true) {
      return <a onClick={this.handleSendEmail}>
        <span><i className="fa fa-check" /> Sent!</span>
      </a>
    } else if (this.state.isSentOrSaved === false) {
      return <a onClick={this.handleSendEmail}>
        <span><i className="fa fa-times" /> Error sending!</span>
      </a>
    } else if (this.state.isSending) {
      return <a onClick={this.handleSendEmail}>
        <span><i className="fa fa-spin fa-refresh" /> Sending email</span>
      </a>
    }

    return <a onClick={this.handleSendEmail}><span><i className="fa fa-paper-plane" /> Send</span></a>;
  }

  render() {
    const accountOptions: accountAddressOption[] = _.reduce(
      this.props.accounts,
      (memo, account) => {
        return _.concat(memo, getAccountContactOptions(account))
      },
      []
    );

    return (
      <section
        id="new-email"
      >
        {/* @ts-ignore */}
        <ControlInput />

        <header
          className="new-email flex header-bar"
          onClick={stopEventPropagation}
          ref={makeDragElement}
        >
          <nav>
            {this.renderSendLink()}
            {this.renderAttachLink()}
          </nav>
        </header>

        <form
          id="send-form"
          className="flex flex-vertical flex-nowrap"
          // Prevent button clicks submitting the form
          onSubmit={(ev) => ev.preventDefault()}
        >
          <div className="flex form-top" onClick={stopEventPropagation}>
            <div className="wide flex flex-nowrap">
              <label htmlFor="to">To</label>
              {this.renderContactsSelect("to")}
            </div>

            <div className="wide flex flex-nowrap">
              <label htmlFor="cc">CC</label>
              {this.renderContactsSelect("cc")}
            </div>

            <div className="wide flex flex-nowrap">
              <label htmlFor="subject">Subject</label>
              <input
                id="subject"
                type="text"
                value={this.state.subject}
                onChange={_.partial(this.handleInputChange, "subject")}
              />
            </div>

            <div className="wide flex">
              <label htmlFor="account">From</label>
              <Select
                id="account"
                classNamePrefix="react-select"
                options={accountOptions}
                value={this.state.accountContact}
                onChange={(v) => this.handleSelectChange("accountContact", v)}
              />
            </div>
          </div>

          <div className="flex form-content" onClick={stopEventPropagation}>
            {/*<EditorSimple
              initialContent={this.props.messageContent || ""}
              onUpdate={(ev: { editor: Editor }) => this.setState({
                html: ev.editor.getHTML(),
                text: ev.editor.getText(),
              })}
            />*/}
            <SquireEditor
              initialContent={this.props.messageContent || ""}
              onUpdate={data => {
                console.log("SET", data);
                this.setState({
                  html: data,
                })
              }}
            />
          </div>

          <div className={`flex form-attachments ${this.state.attachments.length === 0 && "empty"}`}>
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
        </form>
      </section>
    );
  }
}
