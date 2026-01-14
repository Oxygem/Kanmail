import _ from "lodash";
import PropTypes from "prop-types";
import React from "react";

import { ALIAS_FOLDERS, PROVIDERS_DOC_LINK } from "../../constants.ts";
import { openLink } from "../../window.ts";

import { AccountsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, Address, ConnectionSettings, FolderSettings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";


interface IAccountAddressProps {
  address: Address;
  updateName: (ev: any) => void;
  updateEmail: (ev: any) => void;
  deleteAddress: (ev: any) => void;
}

class AccountAddress extends React.Component<IAccountAddressProps> {
  render() {
    return (
      <div className="wide flex contact">
        <div className="contact-address">
          <label>Name</label>
          <input
            type="text"
            value={this.props.address.name}
            onChange={this.props.updateName}
          />
        </div>
        <div className="contact-address">
          <label>Email</label>
          <input
            type="text"
            value={this.props.address.email}
            onChange={this.props.updateEmail}
          />
        </div>
        <button
          type="submit"
          className="cancel"
          onClick={this.props.deleteAddress}
        >
          <i className="fa fa-times"></i>
        </button>
      </div>
    );
  }
}

interface IAccountFormProps {
  accountSettings: AccountSettings;

  isAddingNewAccount?: boolean;
  error?: any;
  accountId?: any;

  itemIndex: number;
  updateItem: (n: number, s: AccountSettings) => void;
  deleteItem?: (n: number) => void
  closeForm: () => void;
}

interface IAccountFormState {
  editingTab: string;

  error: string;

  isSaving: boolean;

  accountId: number;

  name: string;
  imapSettings?: ConnectionSettings;
  smtpSettings?: ConnectionSettings;
  folders: FolderSettings;
  contacts: Address[];
  settings: any;
}

const getInitialState = (props: IAccountFormProps): IAccountFormState => {
  const state: IAccountFormState = {
    editingTab: props.isAddingNewAccount ? "imap" : "address",

    error: props.error,

    isSaving: false,

    accountId: props.accountId,

    name: "",
    folders: new FolderSettings(),
    contacts: [],
    settings: {},
  };

  if (props.accountSettings) {
    state.name = props.accountSettings.name;
    state.imapSettings = _.clone(props.accountSettings.imapSettings);
    state.smtpSettings = _.clone(props.accountSettings.smtpSettings);
    state.folders = _.clone(props.accountSettings.folders) || {};
    state.settings = _.clone(props.accountSettings.settings) || {};
    state.contacts = _.clone(props.accountSettings.contacts) || [];
  }

  return state;
};


export default class AccountForm extends React.Component<IAccountFormProps, IAccountFormState> {
  constructor(props: IAccountFormProps) {
    super(props);
    this.state = getInitialState(props);
  }

  resetState = () => {
    const state = getInitialState(this.props);
    this.setState(state);
  };

  handleClickCancel = (ev) => {
    ev.preventDefault();

    this.resetState();
  };

  handleUpdate = (settingsKey, key, ev) => {
    let value = ev.target.value;
    if (value && ev.target.type === "number") {
      value = parseInt(value);
    }

    const target = this.state[settingsKey];
    target[key] = value;

    // @ts-ignore
    this.setState({
      [settingsKey]: target,
    });
  };

  handleCheckboxUpdate = (settingsKey, key, ev) => {
    const target = this.state[settingsKey];
    target[key] = ev.target.checked;

    // @ts-ignore
    this.setState({
      [settingsKey]: target,
    });
  };

  handleTestConnection = (ev) => {
    ev.preventDefault();

    if (!this.state.name) {
      this.setState({ error: "Please input a name for this account." });
      return;
    }

    this.setState({ isSaving: true });

    AccountsService.TestAccountSettings({
      name: this.state.name,
      imapSettings: this.state.imapSettings || new ConnectionSettings(),
      smtpSettings: this.state.smtpSettings || new ConnectionSettings(),
      folders: this.state.folders,
      contacts: this.state.contacts,
      settings: this.state.settings,
    }).then(updatedSettings => {
      this.props.updateItem(this.props.itemIndex, updatedSettings);
      this.setState({
        isSaving: false
      });
      if (!this.props.isAddingNewAccount) {
        this.props.closeForm();
      }

    }).catch(error => {
      this.setState({
        error: error.message,
        isSaving: false,
      });
      if (error.cause && error.cause.settings) {
        this.props.updateItem(this.props.itemIndex, error.cause.settings);
      }
    })
  };

  handleAddAddress = (ev) => {
    ev.preventDefault();

    const { contacts } = this.state;
    contacts.push(new Address({ name: "", email: "" }));
    this.setState({ contacts });
  };

  renderInput(settingsKey, key, options: any = {}) {
    const type = options.type || "text";
    const placeholder = options.placeholder || null;

    let value = "";
    value = this.state[settingsKey][key];

    const attributes: any = {};
    let handler = _.partial(this.handleUpdate, settingsKey, key);

    if (type === "checkbox") {
      attributes.checked = value || false;
      handler = _.partial(this.handleCheckboxUpdate, settingsKey, key);
    }

    return (
      <input
        type={type}
        id={`${settingsKey}-${key}`}
        value={value}
        placeholder={placeholder}
        onChange={handler}
        {...attributes}
      />
    );
  }

  renderFolderSettings() {
    return _.map(ALIAS_FOLDERS, (folder) => (
      <div className="half" key={folder}>
        <label htmlFor={`folders-${folder}`}>
          {_.upperFirst(folder)}
        </label>
        {this.renderInput("folders", folder)}
      </div>
    ));
  }

  renderAddresses() {
    if (!this.state.contacts || !this.state.contacts.length) {
      return "No addresses!";
    }

    return _.map(this.state.contacts, (contactTuple, i) => {
      const updateName = (ev) => {
        const { contacts } = this.state;
        contacts[i].name = ev.target.value;
        this.setState({
          contacts,
        });
      };

      const updateEmail = (ev) => {
        const { contacts } = this.state;
        contacts[i].email = ev.target.value;
        this.setState({
          contacts,
        });
      };

      const deleteAddress = (ev) => {
        ev.preventDefault();

        const { contacts } = this.state;
        contacts.splice(i, 1);
        this.setState({
          contacts,
        });
      };

      return (
        <AccountAddress
          address={contactTuple}
          updateName={updateName}
          updateEmail={updateEmail}
          deleteAddress={deleteAddress}
          key={i}
        />
      );
    });
  }

  renderUsernamePassword(settingKey) {
    const { oauth_provider } = this.state[settingKey];
    if (oauth_provider) {
      return (
        <div className="wide">
          This account is connected via OAuth provider:{" "}
          <strong>{oauth_provider}</strong>.
        </div>
      );
    }

    return [
      <div className="half" key="username">
        <label htmlFor={`${settingKey}-username`}>Username</label>
        {this.renderInput(settingKey, "username")}
      </div>,
      <div className="half" key="password">
        <label htmlFor={`${settingKey}-password`}>Password</label>
        {this.renderInput(settingKey, "password", {
          type: "password",
          placeholder: "enter to change",
        })}
      </div>,
    ];
  }

  render() {
    const formClasses = ["account"];
    // if (this.state.editing) formClasses.push("active");
    if (this.props.isAddingNewAccount) formClasses.push("new");

    const getTabButtonClass = (tabName) =>
      this.state.editingTab == tabName ? "active" : "inactive";

    const setTab = (tabName, ev) => {
      ev.preventDefault();
      this.setState({ editingTab: tabName });
    };

    const saveButtonClasses = ["submit"];
    if (this.state.isSaving) {
      saveButtonClasses.push("disabled");
    }

    return (
      <form className={formClasses.join(" ")}>
        <div className="wide top-bar">
          <div className="right">
            <button
              type="submit"
              className={saveButtonClasses.join(" ")}
              onClick={this.handleTestConnection}
            >
              {this.state.isSaving && <i className="fa fa-spin fa-refresh"></i>}
              {this.props.isAddingNewAccount ? "Add account" : "Update"}
            </button>
            &nbsp;
            <button type="submit" onClick={this.props.closeForm}>
              Cancel
            </button>
          </div>
          <input
            className="inline"
            type="text"
            value={this.state.name}
            placeholder="Account name"
            onChange={(ev) => this.setState({ name: ev.target.value })}
          />
          <div className="error">{this.state.error}</div>
          <div className="wide button-set tabs">
            {this.props.isAddingNewAccount || (
              <button
                className={getTabButtonClass("address")}
                onClick={_.partial(setTab, "address")}
              >
                Addresses
              </button>
            )}
            &nbsp;
            {this.props.isAddingNewAccount || (
              <button
                className={getTabButtonClass("mailbox")}
                onClick={_.partial(setTab, "mailbox")}
              >
                Mailboxes
              </button>
            )}
            &nbsp;
            <button
              className={getTabButtonClass("imap")}
              onClick={_.partial(setTab, "imap")}
            >
              Incoming (IMAP) server
            </button>
            &nbsp;
            <button
              className={getTabButtonClass("smtp")}
              onClick={_.partial(setTab, "smtp")}
            >
              Outgoing (SMTP) server
            </button>
          </div>
        </div>

        <div className={this.state.editingTab == "address" ? "wide" : "hidden"}>
          <div className="flex wide">{this.renderAddresses()}</div>
          <button
            className="submit add-contact-button"
            onClick={this.handleAddAddress}
          >
            Add address
          </button>
        </div>

        <div className={this.state.editingTab == "mailbox" ? "wide" : "hidden"}>
          <div className="flex wide">
            <div className="half">
              <label htmlFor="settings-folderPrefix">Folder prefix</label>
              {this.renderInput("settings", "folderPrefix")}
            </div>
          </div>

          <div className="flex wide">{this.renderFolderSettings()}</div>

          <div className="flex wide">
            <div className="wide">
              <br />
              <span className="red">Advanced</span>&nbsp; (
              <a
                onClick={(ev) => {
                  ev.preventDefault();
                  openLink(`${PROVIDERS_DOC_LINK}#advanced-settings`);
                }}
              >
                more info
              </a>
              ):
            </div>

            <div className="half">
              <label
                className="checkbox"
                htmlFor="settings-saveSentCopies"
              >
                Save copies of sent mail in the sent folder?
              </label>
              {this.renderInput("settings", "saveSentCopies", {
                type: "checkbox",
              })}
            </div>
            <div className="half">
              <label
                className="checkbox"
                htmlFor="settings-deleteOnTrash"
              >
                Delete emails instead of moving to the trash folder?
              </label>
              {this.renderInput("settings", "deleteOnTrash", {
                type: "checkbox",
              })}
            </div>
            <div className="half">
              <label
                className="checkbox"
                htmlFor="settings-copyFromInbox"
              >
                Copy (not move) emails out of the inbox?
              </label>
              {this.renderInput("settings", "copyFromInbox", {
                type: "checkbox",
              })}
            </div>
          </div>
        </div>

        <div className={this.state.editingTab == "imap" ? "wide" : "hidden"}>
          <div className="flex wide">
            {this.renderUsernamePassword("imapSettings")}
            <div className="three-quarter">
              <label htmlFor="imapSettings-host">Hostname</label>
              {this.renderInput("imapSettings", "host")}
            </div>
            <div className="quarter">
              <label htmlFor="imapSettings-port">Port</label>
              {this.renderInput("imapSettings", "port", {
                type: "number",
              })}
            </div>
            <div className="half">
              <label className="checkbox" htmlFor="imapSettings-ssl">
                Use SSL?
              </label>
              {this.renderInput("imapSettings", "ssl", {
                type: "checkbox",
              })}
            </div>
            <div className="quarter"></div>
          </div>
        </div>

        <div className={this.state.editingTab == "smtp" ? "wide" : "hidden"}>
          <div className="flex wide">
            {this.renderUsernamePassword("smtpSettings")}
            <div className="three-quarter">
              <label htmlFor="smtpSettings-host">Hostname</label>
              {this.renderInput("smtpSettings", "host")}
            </div>
            <div className="quarter">
              <label htmlFor="smtpSettings-port">Port</label>
              {this.renderInput("smtpSettings", "port", {
                type: "number",
              })}
            </div>
            <div className="quarter">
              <label className="checkbox" htmlFor="smtpSettings-ssl">
                Use SSL?
              </label>
              {this.renderInput("smtpSettings", "ssl", {
                type: "checkbox",
              })}
            </div>
            <div className="quarter">
              <label className="checkbox" htmlFor="smtpSettings-tls">
                Use TLS?
              </label>
              {this.renderInput("smtpSettings", "tls", {
                type: "checkbox",
              })}
            </div>
          </div>
        </div>
      </form>
    );
  }
}
