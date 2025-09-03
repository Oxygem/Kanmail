import _ from "lodash";
import React from "react";

import { SettingsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, Settings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import Avatar from "../../components/Avatar.jsx";
import keyboard from "../../keyboard.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import { arrayMove } from "../../util/array.ts";
import { makeDragElement, openLink } from "../../window.ts";
import AccountForm from "../settings/AccountForm.jsx";
import NewAccountForm from "../settings/NewAccountForm.tsx";

interface IAccountProps extends AccountSettings {
  accountIndex: number;
  updateAccount: (n: number, a: AccountSettings) => void;
  deleteAccount: (n: number) => void;
}

interface IAccountState {
  isEditing: boolean;
}

class Account extends React.Component<IAccountProps, IAccountState> {
  constructor(props) {
    super(props);

    this.state = {
      isEditing: false,
    }
  }

  render() {
    if (this.state.isEditing) {
      return <AccountForm
        itemData={this.props}
        itemIndex={this.props.accountIndex}
        updateItem={this.props.updateAccount}
        closeForm={() => (this.setState({ isEditing: false }))}
      />;
    }

    return (
      <div className="account">
        <Avatar address={this.props.contacts[0]} />
        <div className="name">
          <strong>{this.props.name}</strong>
          <br />
          {this.props.imapSettings.username}
        </div>
        <div className="buttons">
          <button
            onClick={() => (this.setState({ isEditing: true }))}
          >Edit</button>
          <button
            className="cancel"
            onClick={() => (this.props.deleteAccount(this.props.accountIndex))}
          >Remove</button>
        </div>
      </div>)
  }
}

interface ISettingsViewProps extends Settings {
  updateFn: (_: Partial<Settings>) => void;
  isWelcomeSettings?: boolean;
}

interface ISettingsViewState {
  isSaving: boolean;
  isSaved: boolean;
  saveError: any;
  tab: string;
  showAccountForm: boolean;
}

export default class SettingsView extends React.Component<ISettingsViewProps, ISettingsViewState> {
  constructor(props: ISettingsViewProps) {
    super(props);

    keyboard.disable();

    this.state = {
      isSaving: false,
      isSaved: false,
      saveError: null,
      showAccountForm: false,
      tab: "accounts",
    };
  }

  setAccounts = (items: AccountSettings[]) => {
    this.props.updateFn({
      accounts: items,
    })
  }

  deleteAccount = (itemIndex: number) => {
    const items = _.filter(this.props.accounts, (_, i) => i !== itemIndex);
    this.setAccounts(items);
  };

  updateAccount = (itemIndex: number, newSettings: AccountSettings) => {
    if (!this.props.accounts[itemIndex]) {
      throw Error("nope");
    }

    const items = this.props.accounts;
    items[itemIndex] = newSettings;
    this.setAccounts(items);
  };

  addAccount = (newSettings: AccountSettings) => {
    const items = this.props.accounts;
    items.push(newSettings);
    this.setAccounts(items);
  };

  moveAccount = (index: number, position: number) => {
    const items = this.props.accounts;
    arrayMove(items, index, index + position);
    this.setAccounts(items);
  };

  // handleSaveSettings = (ev) => {
  //   ev.preventDefault();

  //   if (this.state.isSaving) {
  //     if (this.state.saveError) {
  //       this.setState({ isSaving: false, saveError: null });
  //     }
  //     return;
  //   }

  //   this.setState({ isSaving: true });

  //   SettingsService.PutSettings(this.state.settings)
  //     .then(() => {
  //       this.setState({ isSaved: true });
  //       this.props.onSave();
  //     })
  //     .catch((err) => this.setState({ saveError: err }));
  // };

  renderPrivacyToggles() {
    return <div>
      <div>
        <input
          id="use-contact-icons"
          type="checkbox"
          checked={this.props.system.loadContactIcons}
          onChange={() => (
            this.props.updateFn({
              system: {
                ...this.props.system,
                loadContactIcons: !this.props.system.loadContactIcons,
              }
            })
          )}
        />
        <label htmlFor="use-contact-icons">
          Use gravatar & duckduckgo for contact icons?
        </label>
      </div>
      <div>
        <input
          id="share-crash-analytics"
          type="checkbox"
          checked={this.props.system.shareCrashAnalytics}
          onChange={() => (
            this.props.updateFn({
              system: {
                ...this.props.system,
                shareCrashAnalytics: !this.props.system.shareCrashAnalytics,
              }
            })
          )}
        />
        <label htmlFor="share-crash-analytics">
          Share crash reports &amp; analytics to help us improve Kanmail. <a onClick={(ev) => {
            ev.preventDefault();
            openLink("https://kanmail.io/privacy")
          }}>Privacy policy</a>.
        </label>
      </div>
    </div>;
  }

  renderAppearanceSettings() {
    const setLightTheme = (theme: string) => {
      this.props.updateFn({
        system: {
          ...this.props.system,
          theme: {
            ...this.props.system.theme,
            light: theme,
          },
        }
      })
    }

    const setDarkTheme = (theme: string) => {
      this.props.updateFn({
        system: {
          ...this.props.system,
          theme: {
            ...this.props.system.theme,
            dark: theme,
          },
        }
      })
    }

    return <div className="content appearance">
      <label>Theme to use when the system theme is <strong>light</strong></label>
      <div
        className={`appear-button default ${this.props.system.theme.light == "theme-default" && "active"}`}
        onClick={() => setLightTheme("theme-default")}
      >
        <div className="sidebar"></div>
        <div className="main"></div>
        <span>default (contrast)</span>
      </div>
      <div
        className={`appear-button light ${this.props.system.theme.light == "theme-default-light" && "active"}`}
        onClick={() => setLightTheme("theme-default-light")}
      >
        <div className="sidebar"></div>
        <div className="main"></div>
        <span>light</span>
      </div>
      <div
        className={`appear-button dark ${this.props.system.theme.light == "theme-default-dark" && "active"}`}
        onClick={() => setLightTheme("theme-default-dark")}
      >
        <div className="sidebar"></div>
        <div className="main"></div>
        <span>dark</span>
      </div>

      <label>Theme to use when the system theme is <strong>dark</strong></label>
      <div
        className={`appear-button default ${this.props.system.theme.dark == "theme-default" && "active"}`}
        onClick={() => setDarkTheme("theme-default")}
      >
        <div className="sidebar"></div>
        <div className="main"></div>
        <span>default (contrast)</span>
      </div>
      <div
        className={`appear-button light ${this.props.system.theme.dark == "theme-default-light" && "active"}`}
        onClick={() => setDarkTheme("theme-default-light")}
      >
        <div className="sidebar"></div>
        <div className="main"></div>
        <span>light</span>
      </div>
      <div
        className={`appear-button dark ${this.props.system.theme.dark == "theme-default-dark" && "active"}`}
        onClick={() => setDarkTheme("theme-default-dark")}
      >
        <div className="sidebar"></div>
        <div className="main"></div>
        <span>dark</span>
      </div>
    </div>;
  }

  renderAdvancedSettings() {
    return <div className="content advanced">
      {this.renderPrivacyToggles()}
      <div>
        <input
          id="group-threads-by-subject"
          type="checkbox"
          checked={this.props.system.groupThreadsBySubject}
          onChange={() => (
            this.props.updateFn({
              system: {
                ...this.props.system,
                groupThreadsBySubject: !this.props.system.groupThreadsBySubject,
              }
            })
          )}
        />
        <label htmlFor="group-threads-by-subject">
          Merge threads (per account) with similar subjects
        </label>
      </div>
      <div>
        <input
          id="group-single-threads-by-sender"
          type="checkbox"
          checked={this.props.system.groupSingleSenderThreads}
          onChange={() => (
            this.props.updateFn({
              system: {
                ...this.props.system,
                groupSingleSenderThreads: !this.props.system.groupSingleSenderThreads,
              }
            })
          )}
        />
        <label htmlFor="group-single-threads-by-sender">
          Merge single emails from each sender
        </label>
      </div>
      <div>
        <input
          id="show-help-button"
          type="checkbox"
          checked={this.props.system.showHelpButton}
          onChange={() => (
            this.props.updateFn({
              system: {
                ...this.props.system,
                showHelpButton: !this.props.system.showHelpButton,
              }
            })
          )}
        />
        <label htmlFor="show-help-button">
          Show help button in sidebar
        </label>
      </div>
      <div>
        <label htmlFor="sync-interval">
          Sync interval (ms)
        </label>
        <input
          id="sync-interval"
          type="number"
          value={this.props.system.syncInterval}
          onChange={(ev) => (this.props.updateFn({
            system: {
              ...this.props.system,
              syncInterval: parseInt(ev.target.value),
            }
          }))}
        />
      </div>

      <div>
        <label htmlFor="undo-ms">
          Undo time (ms)
        </label>
        <input
          id="undo-ms"
          type="number"
          value={this.props.system.undoMS}
          onChange={(ev) => (this.props.updateFn({
            system: {
              ...this.props.system,
              undoMS: parseInt(ev.target.value),
            }
          }))}
        />
      </div>

      <div>
        <label htmlFor="batch-size">
          Pagination batch size
        </label>
        <input
          id="batch-size"
          type="number"
          value={this.props.system.batchSize}
          onChange={(ev) => (this.props.updateFn({
            system: {
              ...this.props.system,
              batchSize: parseInt(ev.target.value),
            }
          }))}
        />
      </div>
    </div>;
  }

  renderTabMenu() {
    if (this.props.isWelcomeSettings) {
      return null;
    }

    return <nav>
      <a
        onClick={() => (this.setState({ tab: "accounts" }))}
        className={this.state.tab == "accounts" ? "active" : ""}
      >Accounts</a>
      <a
        onClick={() => (this.setState({ tab: "appearance" }))}
        className={this.state.tab == "appearance" ? "active" : ""}
      >Appearance</a>
      <a
        onClick={() => (this.setState({ tab: "system" }))}
        className={this.state.tab == "system" ? "active" : ""}
      >System</a>
    </nav>;
  }

  renderAccounts() {
    let accountForm: React.JSX.Element
    if (this.props.isWelcomeSettings) {
      accountForm = <NewAccountForm addItem={this.addAccount} />;
    } else if (this.state.showAccountForm) {
      accountForm = <NewAccountForm
        addItem={this.addAccount}
        onClose={() => { this.setState({ showAccountForm: false }) }}
      />
    } else {
      accountForm = <button
        onClick={() => (this.setState({ showAccountForm: true }))}
      >Add new account</button>;
    }

    return <div className="content">
      <div id="accounts">
        {this.props.accounts.map((account, i) => <Account
          accountIndex={i}
          deleteAccount={this.deleteAccount}
          updateAccount={this.updateAccount}
          {...account}
        />)}
      </div>
      {accountForm}
    </div>;
  }

  renderCurrentTab() {
    switch (this.state.tab) {
      case "accounts":
        return this.renderAccounts();
      case "appearance":
        return this.renderAppearanceSettings();
      case "system":
        return this.renderAdvancedSettings();
      default: throw new Error("no such tab: " + this.state.tab);
    }
  }

  renderWelcomeSettingsButton() {
    if (!this.props.isWelcomeSettings) {
      return;
    }
    if (_.isEmpty(this.props.accounts)) {
      return;
    }

    let text: React.JSX.Element | string = (
      <span>
        Start using Kanmail <i className="fa fa-arrow-right" />
      </span>
    );
    const classes = ["main-button"];

    return (
      <div className="content">
        <button
          type="submit"
          className={classes.join(" ")}
          // Apply the settings we have (held by WelcomeSettings) to the main store
          onClick={() => (settingsStore.updateSettings(this.props))}
        >
          {text}
        </button>
        {this.props.isWelcomeSettings && this.renderPrivacyToggles()}
      </div>
    );
  }

  render() {
    return (
      <section id="settings">
        {this.renderTabMenu()}
        {this.renderCurrentTab()}
        {this.renderWelcomeSettingsButton()}
      </section>
    );
  }
}
