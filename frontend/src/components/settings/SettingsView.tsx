import _ from "lodash";
import React from "react";

import { AccountsService, AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, Address, CacheIntegrityResult, CacheStats, EventName, Settings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { Events } from "../../../wails/runtime.js";
import Avatar from "../../components/Avatar.jsx";
import ColorPicker from "../../components/ColorPicker.tsx";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import requestStore, { RuntimeError } from "../../stores/request.ts";
import settingsStore from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import { trackEvent } from "../../util/analytics.ts";
import { arrayMove } from "../../util/array.ts";
import { openFeedbackWindow } from "../../util/feedback.ts";
import { formatBytes } from "../../util/string.ts";
import { openLink } from "../../window.ts";
import AccountForm from "../settings/AccountForm.tsx";
import KeyboardShortcutsTab from "../settings/KeyboardShortcutsTab.tsx";
import LicenseSettings from "../settings/LicenseSettings.tsx";
import NewAccountForm from "../settings/NewAccountForm.tsx";
import SignaturesTab from "../settings/SignaturesTab.tsx";

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
  // Injected by the store subscription below
  accountAuthErrors?: Map<string, RuntimeError>;
}

interface IAccountState {
  isEditing: boolean;
  isDeleting: boolean;
  editTab?: string;
  autoReconnect?: number;
}

@subscribe([requestStore, ["accountAuthErrors"]])
class Account extends React.Component<IAccountProps, IAccountState> {
  constructor(props: IAccountProps) {
    super(props);

    this.state = {
      isEditing: false,
      isDeleting: false,
    }
  }

  deleteAccount = () => {
    AccountsService.AfterDeleteAccount(this.props.id);
    this.props.deleteAccount(this.props.accountIndex);
  }

  render() {
    // Secrets are redacted before settings reach the frontend - hasCredentials marks a
    // keyring-held secret; password/oauthRefreshToken cover just-entered ones not yet saved
    const hasConnectionCredentials = (conn: any) =>
      conn && (conn.hasCredentials || conn.password || conn.oauthRefreshToken);
    const hasValidCredentials =
      hasConnectionCredentials(this.props.imapSettings)
      && hasConnectionCredentials(this.props.smtpSettings);
    // Credentials we still hold but the provider has since disowned - present
    // and well-formed, so hasValidCredentials can't see it
    const needsReconnect = Boolean(this.props.accountAuthErrors?.has(this.props.id));

    const deleteButton = (
      <button
        className="btn-remove"
        onClick={this.state.isDeleting
          ? this.deleteAccount
          : () => this.setState({ isDeleting: true })}
      >
        {this.state.isDeleting ? "Confirm remove" : "Remove"}
      </button>
    );

    return (
      <div className="acct-row-wrap">
        <div className="acct-row">
          <Avatar
            border={settingsStore.getAccountAccentColor(this.props.id)}
            address={(this.props.contacts && this.props.contacts.length > 0)
              ? this.props.contacts[0]
              : new Address({ email: hasValidCredentials ? this.props.imapSettings.username : "" })
            }
          />
          <div className="grow">
            <div className="nm">{this.props.name}</div>
            {!hasValidCredentials
              ? <div className="em error">Credentials invalid, please remove and re-setup.</div>
              : needsReconnect
                ? <div className="em error">Sign-in expired, please reconnect.</div>
                : <div className="em">{this.props.imapSettings.username}</div>}
          </div>
          {hasValidCredentials && needsReconnect && <button
            className="btn-soft"
            onClick={() => this.setState({
              isEditing: true,
              isDeleting: false,
              editTab: this.props.imapSettings?.oauthProvider ? "imap" : "appearance",
              // Open the form and immediately start the reconnect flow
              autoReconnect: (this.state.autoReconnect || 0) + 1,
            })}
          >Reconnect</button>}
          {hasValidCredentials && <button
            className="icon-btn"
            title="Move up"
            onClick={() => this.props.moveAccount(this.props.accountIndex, -1)}
          ><i className="fa fa-arrow-up" /></button>}
          {hasValidCredentials && <button
            className="icon-btn"
            title="Move down"
            onClick={() => this.props.moveAccount(this.props.accountIndex, 1)}
          ><i className="fa fa-arrow-down" /></button>}
          {hasValidCredentials && <button
            className={this.state.isEditing ? "btn-soft active" : "btn-soft"}
            onClick={() => this.setState({
              isEditing: !this.state.isEditing,
              isDeleting: false,
              autoReconnect: 0,
            })}
          >Edit</button>}
          {deleteButton}
        </div>
        {this.state.isEditing && <div className="account-edit">
          <AccountForm
            accountSettings={this.props}
            itemIndex={this.props.accountIndex}
            updateItem={this.props.updateAccount}
            initialTab={this.state.editTab}
            autoReconnect={this.state.autoReconnect}
            closeForm={() => this.setState({
              isEditing: false,
              editTab: undefined,
              autoReconnect: 0,
            })}
          />
        </div>}
      </div>
    );
  }
}

interface ISettingsViewProps extends Settings {
  updateFn: (_: Partial<Settings>) => void;
  isWelcomeSettings?: boolean;
}

type CacheAction = "vacuum" | "check";

interface ISettingsViewState {
  tab: string;
  showAccountForm: boolean;
  cacheStats?: CacheStats;
  cacheAction?: CacheAction;
  cacheActionError?: string;
  integrityResult?: CacheIntegrityResult;
  openColorPicker: string | null;
  showSenderColorForm: boolean;
}

const TABS = ["accounts", "signatures", "appearance", "shortcuts", "system", "licensed", "license"];

export default class SettingsView extends React.Component<ISettingsViewProps, ISettingsViewState> {
  private releaseKeyboard: () => void;
  private releaseTabEvent: () => void;

  constructor(props: ISettingsViewProps) {
    super(props);

    this.releaseKeyboard = keyboard.suspend("SettingsView");

    const initialTab = new URLSearchParams(window.location.search).get("tab");

    this.state = {
      showAccountForm: false,
      tab: TABS.includes(initialTab!) ? initialTab! : "accounts",
      openColorPicker: null,
      showSenderColorForm: false,
    };

    this.releaseTabEvent = Events.On(EventName.SettingsSelectTabEvent, (ev) => {
      const tab = ev.data as string;
      if (TABS.includes(tab)) {
        this.setTab(tab);
      }
    });

    setTimeout(() => this.loadCacheStats());
  }

  loadCacheStats = async () => {
    try {
      this.setState({ cacheStats: await AppService.GetCacheStats() });
    } catch (e) {
      console.error("Failed to load cache stats", e);
    }
  };

  componentWillUnmount() {
    this.releaseKeyboard();
    this.releaseTabEvent();
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
    this.setAccounts([...this.props.accounts, newSettings]);
    this.setState({ showAccountForm: false });
  };

  updateAccount = (itemIndex: number, newSettings: AccountSettings) => {
    if (!this.props.accounts[itemIndex]) {
      throw Error("no such account");
    }

    if (!newSettings.name) {
      newSettings.name = newSettings.imapSettings.username;
    }

    const items = [...this.props.accounts];
    items[itemIndex] = newSettings;
    this.setAccounts(items);
  };

  updateAccountSignature = (accountIndex: number, signature: string) => {
    const account = this.props.accounts[accountIndex];
    if (!account) {
      return;
    }

    const items = [...this.props.accounts];
    items[accountIndex] = {
      ...account,
      settings: { ...account.settings, signature },
    };
    this.setAccounts(items);
  };

  moveAccount = (index: number, position: number) => {
    const items = [...this.props.accounts];
    arrayMove(items, index, index + position);
    this.setAccounts(items);
  };

  // ---- shared render helpers --------------------------------------------

  renderPanel(panelClass: string, body: React.ReactNode) {
    // No header — the tab bar already names the current section.
    return (
      <section className={`km-panel ${panelClass}`}>
        <div className="panel-body">{body}</div>
      </section>
    );
  }

  renderCheckRow(
    checked: boolean,
    onToggle: () => void,
    label: React.ReactNode,
    opts: { hint?: string } = {},
  ) {
    return (
      <div className="check-row" onClick={onToggle}>
        <span className={`cbox ${checked ? "on" : "off"}`}>
          {checked && <i className="fa fa-check" />}
        </span>
        <div className="ctxt">
          <div className="ctxt-main">{label}</div>
          {opts.hint && <div className="ghint">{opts.hint}</div>}
        </div>
      </div>
    );
  }

  updateSystem(patch: Partial<Settings["system"]>) {
    this.props.updateFn({
      system: { ...this.props.system, ...patch },
    });
  }

  renderPrivacyToggles() {
    return <div>
      {this.renderCheckRow(
        this.props.system.loadContactIcons,
        () => this.updateSystem({ loadContactIcons: !this.props.system.loadContactIcons }),
        "Use Gravatar & DuckDuckGo for contact icons",
      )}
      {this.renderCheckRow(
        this.props.system.shareAnalytics,
        () => this.updateSystem({ shareAnalytics: !this.props.system.shareAnalytics }),
        <span>
          Share anonymous analytics to help improve Kanmail. <a onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openLink("https://kanmail.io/privacy");
          }}>Privacy policy</a>.
        </span>,
      )}
    </div>;
  }

  renderSenderColorRow = (email: string, color: string, index: number) => {
    const senderColors = this.props.system.senderColors || {};
    const isOpen = this.state.openColorPicker === email;

    const updateEmail = (newEmail: string) => {
      // Rebuild in iteration order, replacing the edited key in place - the
      // row must not jump to the end (it's keyed by position) mid-edit
      const newSenderColors: { [email: string]: string } = {};
      _.each(senderColors, (existingColor, existingEmail) => {
        if (existingEmail === email) {
          newSenderColors[newEmail.toLowerCase()] = color;
        } else {
          newSenderColors[existingEmail] = existingColor ?? "";
        }
      });
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
      <div className="sender-color-row" key={index}>
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
        {entries.map(([email, color], index) => this.renderSenderColorRow(email, color ?? "", index))}
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
      this.updateSystem({ theme: { ...this.props.system.theme, light: theme } });
    }

    const setDarkTheme = (theme: string) => {
      this.updateSystem({ theme: { ...this.props.system.theme, dark: theme } });
    }

    const themes = [
      { id: "theme-default-light", className: "light", label: "light", locked: false },
      { id: "theme-default-dark", className: "dark", label: "dark", locked: false },
      { id: "theme-default-nord-light", className: "nord-light", label: "nord light", locked: true },
      { id: "theme-default-midnight-blue", className: "midnight-blue", label: "midnight blue", locked: true },
      { id: "theme-default-matrix", className: "matrix", label: "matrix", locked: true },
    ];

    const isLicensed = systemStore.props.isLicensed;

    const renderThemeCard = (
      theme: { id: string; className: string; label: string; locked: boolean },
      selected: string,
      setTheme: (id: string) => void,
    ) => {
      const lockedNow = theme.locked && !isLicensed;
      const onClick = lockedNow
        ? () => AppService.OpenPurchaseLicenseDialog()
        : () => setTheme(theme.id);
      const classes = [
        "theme-card",
        theme.className,
        selected == theme.id ? "active" : "",
        lockedNow ? "locked" : "",
      ].filter(Boolean).join(" ");
      return (
        <div key={theme.id} className={classes} onClick={onClick}>
          <div className="preview">
            <div className="side"></div>
            <div className="body"></div>
          </div>
          <div className="cap">
            <span className="nm">
              {theme.label}
              {lockedNow && <i className="fa fa-lock" title="Requires a Kanmail license" />}
            </span>
            {selected == theme.id && <span className="tick"><i className="fa fa-check" /></span>}
          </div>
        </div>
      );
    };

    const theme = this.props.system.theme;

    const body = <>
      <h3 className="sub">When the system theme is <span className="accent">light</span></h3>
      <div className="theme-grid">
        {themes.map((t) => renderThemeCard(t, theme.light, setLightTheme))}
      </div>

      <h3 className="sub sp">When the system theme is <span className="accent">dark</span></h3>
      <div className="theme-grid">
        {themes.map((t) => renderThemeCard(t, theme.dark, setDarkTheme))}
      </div>

      <h3 className="sub sp">Thread background colors</h3>
      {this.renderCheckRow(
        !!theme.perSenderThreadBackgrounds,
        () => this.updateSystem({ theme: { ...theme, perSenderThreadBackgrounds: !theme.perSenderThreadBackgrounds } }),
        "Tint email threads with their account’s color",
      )}
      {this.renderCheckRow(
        !!theme.alwaysShowThreadBackgrounds,
        () => this.updateSystem({ theme: { ...theme, alwaysShowThreadBackgrounds: !theme.alwaysShowThreadBackgrounds } }),
        "Always show thread backgrounds (not just on hover)",
      )}

      <h3 className="sub sp">Interface</h3>
      {this.renderCheckRow(
        this.props.system.showHelpButton,
        () => this.updateSystem({ showHelpButton: !this.props.system.showHelpButton }),
        "Show help button in sidebar",
      )}
      {this.renderCheckRow(
        !!this.props.system.statusBarOpen,
        () => this.updateSystem({ statusBarOpen: !this.props.system.statusBarOpen }),
        "Expand the sync status list in the sidebar footer",
      )}

      <h3 className="sub sp">Sender-specific thread colors</h3>
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
          <i className="fa fa-plus" /> Add sender color
        </button>
      )}
    </>;

    return this.renderPanel("appearance-panel", body);
  }

  renderNumberField(label: string, value: number, onChange: (v: number) => void) {
    return (
      <div className="field-group">
        <div className="lbl">{label}</div>
        <input
          type="number"
          value={value}
          onChange={(ev) => onChange(parseInt(ev.target.value))}
        />
      </div>
    );
  }

  runCacheAction = async (action: CacheAction) => {
    this.setState({ cacheAction: action, cacheActionError: undefined });

    try {
      if (action === "vacuum") {
        this.setState({ cacheStats: await AppService.VacuumCache() });
      } else {
        this.setState({ integrityResult: await AppService.CheckCacheIntegrity() });
      }
    } catch (e) {
      this.setState({ cacheActionError: `${e}` });
    } finally {
      this.setState({ cacheAction: undefined });
    }
  };

  renderDebugOnly(children: React.ReactNode) {
    if (!systemStore.props.isDebug) {
      return null;
    }

    return (
      <div className="debug-only">
        <div className="debug-only-label">🐛 Debug only</div>
        {children}
      </div>
    );
  }

  renderCacheActions() {
    const { cacheAction, cacheActionError, integrityResult } = this.state;

    return <>
      <div className="cache-actions">
        <button
          className="btn-soft"
          disabled={!!cacheAction}
          onClick={() => this.runCacheAction("vacuum")}
        >
          <i className={`fa ${cacheAction === "vacuum" ? "fa-spinner fa-spin" : "fa-compress"}`} />
          {" "}Vacuum &amp; optimise
        </button>
        <button
          className="btn-soft"
          disabled={!!cacheAction}
          onClick={() => this.runCacheAction("check")}
        >
          <i className={`fa ${cacheAction === "check" ? "fa-spinner fa-spin" : "fa-stethoscope"}`} />
          {" "}Integrity check
        </button>
      </div>
      {cacheActionError && <div className="cache-result bad">{cacheActionError}</div>}
      {integrityResult && (
        <div className={`cache-result ${integrityResult.OK ? "good" : "bad"}`}>
          {integrityResult.OK
            ? `No problems found (${integrityResult.DurationMS}ms)`
            : integrityResult.Messages.join("\n")}
        </div>
      )}
    </>;
  }

  renderSystemSettings() {
    const { cacheStats } = this.state;
    const cacheStat = (k: string, v: React.ReactNode) => (
      <div className="cache-stat"><span className="k">{k}</span><span className="v">{v}</span></div>
    );
    const cacheGroup = (title: string, stats: React.ReactNode) => (
      <div className="cache-card">
        <div className="cache-group-title">{title}</div>
        <div className="cache-grid">{stats}</div>
      </div>
    );

    const body = <>
      <h3 className="sub">Privacy</h3>
      {this.renderPrivacyToggles()}

      <h3 className="sub sp">Sync</h3>
      <div className="sync-grid">
        {this.renderNumberField("Undo timeout (ms)", this.props.system.undoMS, (v) => this.updateSystem({ undoMS: v }))}
        {this.renderNumberField("Sync interval (ms)", this.props.system.syncInterval, (v) => this.updateSystem({ syncInterval: v }))}
        {this.renderNumberField("Pagination batch size", this.props.system.batchSize, (v) => this.updateSystem({ batchSize: v }))}
      </div>

      <h3 className="sub sp">Cache</h3>
      {cacheStats && this.renderDebugOnly(<>
        {cacheGroup("Storage", <>
          {cacheStat("Total on disk", formatBytes(cacheStats.TotalOnDiskSize))}
          {cacheStat("Database file", formatBytes(cacheStats.FileSize))}
          {cacheStat("Write-ahead log", formatBytes(cacheStats.WALSize))}
          {cacheStat("Shared memory", formatBytes(cacheStats.SHMSize))}
          {cacheStat("Logical size", formatBytes(cacheStats.LogicalSize))}
          {cacheStat("Maximum size", formatBytes(cacheStats.MaxSize))}
          {cacheStat("Page size", `${cacheStats.PageSize} (${formatBytes(cacheStats.PageSize)})`)}
          {cacheStat("Page count", cacheStats.PageCount.toLocaleString())}
          {cacheStat("Free pages", cacheStats.FreelistPages.toLocaleString())}
          {cacheStat("Free space", <>
            {formatBytes(cacheStats.FreelistSize)} ({cacheStats.FreelistPercent.toFixed(1)}%)
            <span className="cache-bar">
              <span style={{ width: `${Math.min(cacheStats.FreelistPercent, 100)}%` }} />
            </span>
          </>)}
        </>)}

        {cacheGroup("Configuration", <>
          {cacheStat("Journal mode", cacheStats.JournalMode)}
          {cacheStat("Synchronous", cacheStats.Synchronous)}
          {cacheStat("Auto-vacuum", cacheStats.AutoVacuum)}
          {cacheStat("Locking mode", cacheStats.LockingMode)}
          {cacheStat("Temp store", cacheStats.TempStore)}
          {cacheStat("Encoding", cacheStats.Encoding)}
          {cacheStat("Foreign keys", cacheStats.ForeignKeys ? "on" : "off")}
          {cacheStat("Busy timeout", `${cacheStats.BusyTimeout}ms`)}
          {/* SQLite reports cache_size as pages, or as kibibytes when negative */}
          {cacheStat("Page cache", cacheStats.CacheSize < 0
            ? formatBytes(-cacheStats.CacheSize * 1024)
            : `${cacheStats.CacheSize.toLocaleString()} pages`)}
          {cacheStat("WAL autocheckpoint", `${cacheStats.WALAutocheckpoint} pages`)}
          {cacheStat("Cache writes", cacheStats.CachesDisabled ? "disabled" : "enabled")}
        </>)}

        {cacheGroup("Versions", <>
          {cacheStat("SQLite version", cacheStats.SQLiteVersion)}
          {cacheStat("Schema version", cacheStats.SchemaVersion)}
          {cacheStat("User version", cacheStats.UserVersion)}
          {cacheStat("Application ID", cacheStats.ApplicationID)}
          {cacheStat("Migrations", `${cacheStats.MigrationCount} (${cacheStats.LatestMigration})`)}
          {cacheStat("Upgrades", cacheStats.UpgradeCount
            ? `${cacheStats.UpgradeCount} (${cacheStats.LatestUpgrade})`
            : "0")}
          {cacheStat("Tables", cacheStats.TableCount)}
          {cacheStat("Indexes", cacheStats.IndexCount)}
          {cacheStat("Triggers", cacheStats.TriggerCount)}
          {cacheStat("Views", cacheStats.ViewCount)}
        </>)}
      </>)}
      {this.renderDebugOnly(this.renderCacheActions())}

      <h3 className="sub sp">Debug</h3>
      {cacheStats && <div className="debug-row">
        <div className="k">Database path</div>
        <div className="v">{cacheStats.DatabaseFilename}</div>
      </div>}
      <div className="debug-row">
        <div className="k">Log file</div>
        <div className="v">{systemStore.props.logFilename}</div>
      </div>
      <div className="debug-row">
        <div className="k">Executable</div>
        <div className="v">{systemStore.props.executableFilename}</div>
      </div>
      <div className="debug-actions">
        <button className="btn-soft" onClick={AppService.RestartApp}>
          <i className="fa fa-refresh" /> Restart Kanmail
        </button>
        <button className="btn-danger" onClick={AppService.ClearCacheAndRestart}>
          <i className="fa fa-trash" /> Clear cache &amp; restart
        </button>
        <button className="btn-soft" onClick={() => AppService.OpenFile(systemStore.props.logFilename)}>
          <i className="fa fa-file-text-o" /> Open log file
        </button>
        <button className="btn-soft" onClick={() => openFeedbackWindow("SettingsOpenFeedback")}>
          <i className="fa fa-comment-o" /> Give feedback
        </button>
        {!this.props.system.showWelcomeEmail && (
          <button className="btn-soft" onClick={() => this.updateSystem({ showWelcomeEmail: true })}>
            <i className="fa fa-envelope-o" /> Reset welcome email
          </button>
        )}
      </div>
    </>;

    return this.renderPanel("system-panel", body);
  }

  renderLicensedSettings() {
    const body = <>
      <div className="goodies-banner">
        <span className="ic"><i className="fa fa-trophy" /></span>
        <div>
          <div className="tt">Thanks for buying Kanmail!</div>
          <div className="ds">A few extras and experiments, unlocked for licensed users.</div>
        </div>
      </div>

      {this.renderCheckRow(
        this.props.system.showHiddenAttachments,
        () => this.updateSystem({ showHiddenAttachments: !this.props.system.showHiddenAttachments }),
        "Show hidden attachments (text/html)",
      )}
      {this.renderCheckRow(
        this.props.system.groupSingleSenderThreads,
        () => this.updateSystem({ groupSingleSenderThreads: !this.props.system.groupSingleSenderThreads }),
        <>
          <span className="glabel">Merge single emails from each sender</span>
          <span className="badge-exp">Experiment</span>
        </>,
        { hint: "Requires restart" },
      )}
      {this.renderCheckRow(
        this.props.system.groupThreadsBySubject,
        () => this.updateSystem({ groupThreadsBySubject: !this.props.system.groupThreadsBySubject }),
        <>
          <span className="glabel">Merge threads (per account) with similar subjects</span>
          <span className="badge-exp">Experiment</span>
        </>,
        { hint: "Requires restart" },
      )}
      {this.renderCheckRow(
        this.props.system.disableRemoteSearch,
        () => this.updateSystem({ disableRemoteSearch: !this.props.system.disableRemoteSearch }),
        <>
          <span className="glabel">Disable remote search</span>
          <span className="badge-exp">Experiment</span>
        </>,
        { hint: "Search only the local email cache, never the mail server" },
      )}
    </>;

    return this.renderPanel("goodies-panel", body);
  }

  setTab = (tab: string) => {
    this.setState({ tab });
    window.scrollTo(0, 0);
  };

  renderTabMenu() {
    if (this.props.isWelcomeSettings) {
      return null;
    }

    return <nav className="titlebar">
      <a
        onClick={() => this.setTab("accounts")}
        className={this.state.tab == "accounts" ? "active" : ""}
      >Accounts</a>
      <a
        onClick={() => this.setTab("signatures")}
        className={this.state.tab == "signatures" ? "active" : ""}
      >Signatures</a>
      <a
        onClick={() => this.setTab("appearance")}
        className={this.state.tab == "appearance" ? "active" : ""}
      >Appearance</a>
      <a
        onClick={() => this.setTab("shortcuts")}
        className={this.state.tab == "shortcuts" ? "active" : ""}
      >Shortcuts</a>
      <a
        onClick={() => this.setTab("system")}
        className={this.state.tab == "system" ? "active" : ""}
      >System</a>
      <a
        onClick={() => this.setTab("license")}
        className={this.state.tab == "license" ? "active" : ""}
      >{systemStore.props.isLicensed ? "License" : "Upgrade"}</a>
      {systemStore.props.isLicensed ? <a
        onClick={() => this.setTab("licensed")}
        className={this.state.tab == "licensed" ? "active" : ""}
      >🏆 Goodies</a> : null}
      <div className="header-errors-anchor"></div>
    </nav>;
  }

  renderAccounts() {
    let accountForm: React.JSX.Element | null = null;
    if (this.props.isWelcomeSettings) {
      // Show the form until the first account is added, after that it expands
      // via the "Add another account" welcome action button
      if (_.isEmpty(this.props.accounts) || this.state.showAccountForm) {
        accountForm = <NewAccountForm addItem={this.addAccount} />;
      }
    } else if (this.state.showAccountForm) {
      accountForm = <NewAccountForm
        addItem={this.addAccount}
        onClose={() => { this.setState({ showAccountForm: false }) }}
      />
    } else {
      accountForm = <button
        className="add-account-button"
        onClick={() => (this.setState({ showAccountForm: true }))}
      ><i className="fa fa-plus" /> Add new account</button>;
    }

    const body = <>
      <div className="km-accounts">
        {this.props.accounts.map((account, i) => <Account
          key={account.id || i}
          accountIndex={i}
          deleteAccount={this.deleteAccount}
          updateAccount={this.updateAccount}
          moveAccount={this.moveAccount}
          {...account}
        />)}
      </div>
      {accountForm}
    </>;

    return this.renderPanel("accounts-panel", body);
  }

  renderShortcuts() {
    return this.renderPanel("shortcuts-panel",
      <KeyboardShortcutsTab
        system={this.props.system}
        updateFn={this.props.updateFn}
      />,
    );
  }

  renderCurrentTab() {
    switch (this.state.tab) {
      case "accounts":
        return this.renderAccounts()
      case "signatures":
        return this.renderPanel("signatures-panel", <SignaturesTab
          accounts={this.props.accounts}
          updateAccountSignature={this.updateAccountSignature}
        />)
      case "appearance":
        return this.renderAppearanceSettings()
      case "shortcuts":
        return this.renderShortcuts()
      case "system":
        return this.renderSystemSettings()
      case "licensed":
        return this.renderLicensedSettings()
      case "license":
        return this.renderPanel("license-panel", <LicenseSettings />)
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

    return (
      <div className="welcome-actions">
        <div className="welcome-buttons">
          {!this.state.showAccountForm && <button
            className="add-account-button"
            onClick={() => this.setState({ showAccountForm: true })}
          >
            <i className="fa fa-plus" /> Add another account
          </button>}
          <button
            type="submit"
            className="main-button"
            // Apply the settings we have (held by WelcomeSettings) to the main store
            onClick={async () => {
              trackEvent("OnboardingComplete");
              AppService.ResizeWindow(
                Math.round(Math.min(window.screen.availWidth * 0.9, 1600)),
                Math.round(Math.min(window.screen.availHeight * 0.9, 1000)),
              );
              await settingsStore.updateSettings(this.props);
            }}
          >
            Start using Kanmail <i className="fa fa-arrow-right" />
          </button>
        </div>
        {this.renderPrivacyToggles()}
      </div>
    );
  }

  render() {
    return (
      <section id="settings">
        {this.renderTabMenu()}
        <div className="km-settings">
          {this.renderCurrentTab()}
          {this.renderWelcomeSettingsButton()}
        </div>
      </section>
    );
  }
}
