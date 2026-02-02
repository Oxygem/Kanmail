import _ from "lodash";
import React from "react";

import { AccountsService, AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, Address, CacheStats, Settings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import Avatar from "../../components/Avatar.jsx";
import ColorPicker from "../../components/ColorPicker.tsx";
import keyboard from "../../keyboard.ts";
import settingsStore from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import { trackEvent } from "../../util/analytics.ts";
import { arrayMove } from "../../util/array.ts";
import { openLink } from "../../window.ts";
import AccountForm from "../settings/AccountForm.tsx";
import NewAccountForm from "../settings/NewAccountForm.tsx";

interface ISenderColorFormProps {
  existingEmails: string[];
  onSave: (email: string, color: string) => void;
  onCancel: () => void;
}

interface ISenderColorFormState {
  email: string;
  color: string;
  showColorPicker: boolean;
  error: string;
}

class SenderColorForm extends React.Component<ISenderColorFormProps, ISenderColorFormState> {
  constructor(props: ISenderColorFormProps) {
    super(props);
    this.state = {
      email: "",
      color: "transparent",
      showColorPicker: false,
      error: "",
    };
  }

  handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const email = this.state.email.toLowerCase().trim();

    if (!email) {
      this.setState({ error: "Please enter an email address" });
      return;
    }

    if (this.props.existingEmails.includes(email)) {
      this.setState({ error: "This email already has a color" });
      return;
    }

    this.props.onSave(email, this.state.color);
  };

  render() {
    return (
      <form className="sender-color-form" onSubmit={this.handleSubmit}>
        <div className="sender-color-row">
          <input
            type="text"
            placeholder="sender@example.com"
            value={this.state.email}
            onChange={(ev) => this.setState({ email: ev.target.value, error: "" })}
          />
          <ColorPicker
            color={this.state.color}
            onChange={(color) => this.setState({ color })}
            isOpen={this.state.showColorPicker}
            onToggle={() => this.setState({ showColorPicker: !this.state.showColorPicker })}
            onClose={() => this.setState({ showColorPicker: false })}
          />
          <button type="submit" className="submit small">
            Add
          </button>
          <button
            type="button"
            className="cancel small"
            onClick={this.props.onCancel}
          >
            Cancel
          </button>
        </div>
        {this.state.error && <div className="error">{this.state.error}</div>}
      </form>
    );
  }
}

interface IAccountProps extends AccountSettings {
  accountIndex: number;
  updateAccount: (n: number, a: AccountSettings) => void;
  deleteAccount: (n: number) => void;
  moveAccount: (i: number, p: number) => void;
}

interface IAccountState {
  isEditing: boolean;
  isDeleting: boolean;
}

class Account extends React.Component<IAccountProps, IAccountState> {
  constructor(props) {
    super(props);

    this.state = {
      isEditing: false,
      isDeleting: false,
    }
  }

  deleteAccount = () => {
    AccountsService.AfterDeleteAccount(this.props.name);
    this.props.deleteAccount(this.props.accountIndex);
  }

  render() {
    const hasValidCredentials =
      (this.props.imapSettings && (this.props.imapSettings.password || this.props.imapSettings.oauthRefreshToken))
      && (this.props.smtpSettings && (this.props.smtpSettings.password || this.props.smtpSettings.oauthRefreshToken));

    let deleteButton: React.ReactElement;
    if (this.state.isDeleting) {
      deleteButton = <button
        className="cancel"
        onClick={this.deleteAccount}
      >Confirm remove</button>;
    } else {
      deleteButton = <button
        className="cancel"
        onClick={() => (this.setState({ isDeleting: true }))}
      >Remove</button>;
    }

    return (
      <div className="account">
        <Avatar
          border={settingsStore.getAccountAccentColor(this.props.name)}
          address={(this.props.contacts && this.props.contacts.length > 0)
            ? this.props.contacts[0]
            : new Address({ email: hasValidCredentials ? this.props.imapSettings.username : "" })
          }
        />
        <div className="name">
          <strong>{this.props.name}</strong>
          <br />
          {hasValidCredentials ?
            this.props.imapSettings.username
            : <span className="red">Credentials invalid, please remove and re-setup.</span>
          }
        </div>
        <div className="buttons">
          {hasValidCredentials && <button
            onClick={() => this.props.moveAccount(this.props.accountIndex, -1)}
          ><i className="fa fa-arrow-up" /></button>}
          {hasValidCredentials && <button
            onClick={() => this.props.moveAccount(this.props.accountIndex, 1)}
          ><i className="fa fa-arrow-down" /></button>}
          {hasValidCredentials && <button
            className={this.state.isEditing ? "active" : ""}
            onClick={() => (this.setState({ isEditing: !this.state.isEditing, isDeleting: false }))}
          >Edit</button>}
          {deleteButton}
        </div>
        {
          this.state.isEditing && <AccountForm
            accountSettings={this.props}
            itemIndex={this.props.accountIndex}
            updateItem={this.props.updateAccount}
            closeForm={() => (this.setState({ isEditing: false }))}
          />
        }
      </div >
    );
  }
}

interface ISettingsViewProps extends Settings {
  updateFn: (_: Partial<Settings>) => void;
  isWelcomeSettings?: boolean;
}

interface ISettingsViewState {
  tab: string;
  showAccountForm: boolean;
  cacheStats?: CacheStats;
  openColorPicker: string | null;
  showSenderColorForm: boolean;
}

export default class SettingsView extends React.Component<ISettingsViewProps, ISettingsViewState> {
  constructor(props: ISettingsViewProps) {
    super(props);

    keyboard.disable();

    this.state = {
      showAccountForm: false,
      tab: "accounts",
      openColorPicker: null,
      showSenderColorForm: false,
    };

    setTimeout(async () => {
      const stats: CacheStats = await AppService.GetCacheStats();
      this.setState({
        cacheStats: stats,
      });
    })
  }

  getAccountNames = (idx: number = -1): string[] => {
    const names: string[] = [];
    _.each(this.props.accounts, (account, i) => {
      if (idx === -1 || i !== idx) {
        names.push(account.name);
      }
    });
    return names;
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

  addAccount = (newSettings: AccountSettings) => {
    if (!newSettings.name) {
      newSettings.name = newSettings.imapSettings.username || "new account";
    }
    while (_.includes(this.getAccountNames(), newSettings.name)) {
      newSettings.name = `${newSettings.name}-duplicate`;
    }
    const items = this.props.accounts;
    items.push(newSettings);
    this.setAccounts(items);
  };

  updateAccount = (itemIndex: number, newSettings: AccountSettings) => {
    if (!this.props.accounts[itemIndex]) {
      throw Error("no such account");
    }

    if (!newSettings.name) {
      newSettings.name = newSettings.imapSettings.username;
    }
    while (_.includes(this.getAccountNames(itemIndex), newSettings.name)) {
      newSettings.name = `${newSettings.name}-duplicate`;
    }

    const items = this.props.accounts;
    items[itemIndex] = newSettings;
    this.setAccounts(items);
  };

  moveAccount = (index: number, position: number) => {
    const items = this.props.accounts;
    arrayMove(items, index, index + position);
    this.setAccounts(items);
  };

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
          checked={this.props.system.shareAnalytics}
          onChange={() => (
            this.props.updateFn({
              system: {
                ...this.props.system,
                shareAnalytics: !this.props.system.shareAnalytics,
              }
            })
          )}
        />
        <label htmlFor="share-crash-analytics">
          Share anonymous analytics to help us improve Kanmail. <a onClick={(ev) => {
            ev.preventDefault();
            openLink("https://kanmail.io/privacy")
          }}>Privacy policy</a>.
        </label>
      </div>
    </div>;
  }

  renderSenderColorRow = (email: string, color: string) => {
    const senderColors = this.props.system.senderColors || {};
    const isOpen = this.state.openColorPicker === email;

    const updateEmail = (newEmail: string) => {
      const newSenderColors = { ...senderColors };
      delete newSenderColors[email];
      newSenderColors[newEmail.toLowerCase()] = color;
      this.props.updateFn({
        system: {
          ...this.props.system,
          senderColors: newSenderColors,
        }
      });
      if (isOpen) {
        this.setState({ openColorPicker: newEmail.toLowerCase() });
      }
    };

    const updateColor = (newColor: string) => {
      const newSenderColors = { ...senderColors };
      newSenderColors[email] = newColor;
      this.props.updateFn({
        system: {
          ...this.props.system,
          senderColors: newSenderColors,
        }
      });
    };

    const removeEntry = () => {
      const newSenderColors = { ...senderColors };
      delete newSenderColors[email];
      this.props.updateFn({
        system: {
          ...this.props.system,
          senderColors: newSenderColors,
        }
      });
      this.setState({ openColorPicker: null });
    };

    return (
      <div className="sender-color-row" key={email}>
        <input
          type="text"
          placeholder="sender@example.com"
          value={email}
          onChange={(ev) => updateEmail(ev.target.value)}
        />
        <ColorPicker
          color={color}
          onChange={updateColor}
          isOpen={isOpen}
          onToggle={() => this.setState({ openColorPicker: isOpen ? null : email })}
          onClose={() => this.setState({ openColorPicker: null })}
        />
        <button
          type="button"
          className="cancel small"
          onClick={removeEntry}
        >
          <i className="fa fa-times"></i>
        </button>
      </div>
    );
  };

  renderSenderColors() {
    const senderColors = this.props.system.senderColors || {};
    const entries = Object.entries(senderColors);

    if (entries.length === 0) {
      return <div className="sender-colors-empty">No sender colors configured</div>;
    }

    return (
      <div className="sender-colors-list">
        {entries.map(([email, color]) => this.renderSenderColorRow(email, color))}
      </div>
    );
  }

  saveSenderColor = (email: string, color: string) => {
    const senderColors = this.props.system.senderColors || {};
    this.props.updateFn({
      system: {
        ...this.props.system,
        senderColors: {
          ...senderColors,
          [email]: color,
        },
      }
    });
    this.setState({ showSenderColorForm: false });
  };

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
      <div className="group">
        <h3>Theme to use when the system theme is <strong>light</strong></h3>
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

        <h3>Theme to use when the system theme is <strong>dark</strong></h3>
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
      </div>

      <div className="group">
        <h3>Thread Background Colors</h3>
        <div className="wide">
          <input
            id="per-sender-thread-backgrounds"
            type="checkbox"
            checked={this.props.system.theme.perSenderThreadBackgrounds}
            onChange={() => (
              this.props.updateFn({
                system: {
                  ...this.props.system,
                  theme: {
                    ...this.props.system.theme,
                    perSenderThreadBackgrounds: !this.props.system.theme.perSenderThreadBackgrounds,
                  },
                },
              })
            )}
          />
          <label htmlFor="per-sender-thread-backgrounds">
            Use different backgrounds for email thread accounts?
          </label>
        </div>
        <div className="wide">
          <input
            id="always-show-thread-backgrounds"
            type="checkbox"
            checked={this.props.system.theme.alwaysShowThreadBackgrounds}
            onChange={() => (
              this.props.updateFn({
                system: {
                  ...this.props.system,
                  theme: {
                    ...this.props.system.theme,
                    alwaysShowThreadBackgrounds: !this.props.system.theme.alwaysShowThreadBackgrounds,
                  },
                },
              })
            )}
          />
          <label htmlFor="always-show-thread-backgrounds">
            Always show email thread backgrounds?
          </label>
        </div>
      </div>

      <div className="group">
        <h3>Sender-specific thread colors</h3>
        <p className="help-text">
          Highlight email threads from specific senders with custom background colors.
        </p>
        {this.renderSenderColors()}
        {this.state.showSenderColorForm ? (
          <SenderColorForm
            existingEmails={Object.keys(this.props.system.senderColors || {})}
            onSave={this.saveSenderColor}
            onCancel={() => this.setState({ showSenderColorForm: false })}
          />
        ) : (
          <button
            type="button"
            className="submit small"
            onClick={() => this.setState({ showSenderColorForm: true })}
          >
            Add sender color
          </button>
        )}
      </div>
    </div>;
  }

  renderSystemSettings() {
    return <div className="content advanced">
      <div className="group">
        <h3>Privacy</h3>
        {this.renderPrivacyToggles()}
      </div>

      <div className="group">
        <h3>Sync</h3>
        <div>
          <label htmlFor="undo-ms">
            Undo timeout (ms)
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
      </div>

      <div className="group">
        <h3>Cache</h3>
        {this.state.cacheStats && <ul>
          <li>Database size: {this.state.cacheStats.DatabaseSizeFormatted}</li>
          <li>Database path: <code>{this.state.cacheStats.DatabaseFilename}</code></li>
          {systemStore.props.isDebug && <li>(debug)
            <ul>
              <li>Page size: {this.state.cacheStats.PageSize}</li>
              <li>Page count: {this.state.cacheStats.PageCount}</li>
              <li>Free pages: {this.state.cacheStats.FreelistPages}</li>
              <li>Schema version: {this.state.cacheStats.SchemaVersion}</li>
            </ul>
          </li>}
        </ul>}
        <div>
          <button
            className="red"
            onClick={AppService.ClearCacheAndRestart}
          >Clear cache &amp; restart</button>
        </div>
      </div>

      <div className="group">
        <h3>Debug</h3>
        <ul>
          <li>Log file: <code>{systemStore.props.logFilename}</code></li>
          <li>Executable: <code>{systemStore.props.executableFilename}</code></li>
        </ul>
        <div>
          <button
            className="green"
            onClick={AppService.RestartApp}
          >Restart Kanmail</button>
          <button
            onClick={() => AppService.OpenLink(systemStore.props.logFilename)}
          >Open Log File</button>
        </div>
      </div>
    </div>;
  }

  renderLicensedSettings() {
    return <div className="content advanced">
      <div className="group">
        <p>Thank you for purchasing a Kanmail license!</p>
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
          <input
            id="show-hidden-attachments"
            type="checkbox"
            checked={this.props.system.showHiddenAttachments}
            onChange={() => (
              this.props.updateFn({
                system: {
                  ...this.props.system,
                  showHiddenAttachments: !this.props.system.showHiddenAttachments,
                }
              })
            )}
          />
          <label htmlFor="show-hidden-attachments">
            Show hidden attachments (text/html)
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
            [EXPERIMENT, requires restart] Merge single emails from each sender
          </label>
        </div>

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
            [EXPERIMENT, requires restart] Merge threads (per account) with similar subjects
          </label>
        </div>
      </div>
    </div>
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
      {systemStore.props.isLicensed ? <a
        onClick={() => (this.setState({ tab: "licensed" }))}
        className={this.state.tab == "licensed" ? "active" : ""}
      >🏆 Goodies</a> : null}
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
      <div className="accounts">
        {this.props.accounts.map((account, i) => <Account
          accountIndex={i}
          deleteAccount={this.deleteAccount}
          updateAccount={this.updateAccount}
          moveAccount={this.moveAccount}
          {...account}
        />)}
      </div>
      {accountForm}
    </div>;
  }

  renderCurrentTab() {
    switch (this.state.tab) {
      case "accounts":
        return this.renderAccounts()
      case "appearance":
        return this.renderAppearanceSettings()
      case "system":
        return this.renderSystemSettings()
      case "licensed":
        return this.renderLicensedSettings()
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
          onClick={() => {
            trackEvent("OnboardingComplete");
            settingsStore.updateSettings(this.props);
          }}
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
