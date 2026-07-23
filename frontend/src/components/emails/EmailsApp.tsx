import _ from "lodash";
import React from "react";
import { DragDropContext } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { ALIAS_FOLDERS, INBOX } from "../../constants.ts";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import { getColumnMetaStore, getColumnStore } from "../../stores/columns.ts";
import mainEmailStore from "../../stores/emails/main.ts";
import filterStore from "../../stores/filters.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import { trackEvent } from "../../util/analytics.ts";
import { collectVisibleThreadComponents } from "../../util/threads.ts";
import { createWindowPositionHandlers } from "../../window.ts";
import Tooltip from "../Tooltip.tsx";
import AddNewColumnForm from "./AddNewColumnForm.tsx";
import Cheatsheet from "./Cheatsheet.tsx";
import CommandBar from "./CommandBar.tsx";
import EmailColumn from "./EmailColumn.tsx";
import OnboardingColumnsPanel from "./OnboardingColumnsPanel.tsx";
import Search from "./Search.jsx";
import SearchResultsColumn from "./SearchResultsColumn.tsx";
import Sidebar from "./Sidebar.jsx";
import Thread from "./Thread.jsx";
import WelcomeSettings from "./WelcomeSettings.jsx";
import WorkflowSwitcher from "./WorkflowSwitcher.tsx";

@subscribe(settingsStore)
@DragDropContext(HTML5Backend)
export default class EmailsApp extends React.Component<ISettings> {
  getNewEmailsInterval: ReturnType<typeof setInterval>;
  columnRefs: (EmailColumn | SearchResultsColumn | null)[] = [];

  getFoldersToSync() {
    return _.uniq(_.concat(
      // All columns across workflows first since these are displayed
      settingsStore.getAllColumns(),
      // Then the most common folders and any pinned sidebar folders
      ALIAS_FOLDERS,
      settingsStore.props.sidebarFolders,
    ));
  }

  componentDidMount() {
    // Keyboard is enabled by default. WelcomeSettings (shown when accounts
    // is empty) suspends it via the SettingsView it mounts.

    // Let the keyboard reach our columns to enter keyboard mode from cold.
    keyboard.emailsApp = this;

    // Create resize/move window position saver handlers
    createWindowPositionHandlers();

    // Kick off version + license + update checks
    systemStore.checkCurrentVersion();
    systemStore.checkLicense();
    systemStore.checkUpdate();
    // Recheck every 24h
    setInterval(
      () => {
        systemStore.checkLicense();
        systemStore.checkUpdate();
      },
      1000 * 3600 * 24,
    );

    // Run one sync immediately for hidden but relevant folders
    const hiddenFolders = _.without(
      this.getFoldersToSync(),
      ...settingsStore.getCurrentColumns(),
    );
    setTimeout(async () => {
      for (let i = 0; i < hiddenFolders.length; i++) {
        getColumnStore(hiddenFolders[i]);
        await mainEmailStore.onShowFolder(hiddenFolders[i]);
      }
    }, 100);


    // Kick off a folders load for each account
    setTimeout(() => {
      this.props.accounts.forEach(a => filterStore.getAccountFolderNames(a.id))
    }, 200);

    // Kick off new emails loop
    setTimeout(this.getNewEmailsLoop, settingsStore.props.system.syncInterval);

    trackEvent("EmailsAppMounted");
    if (this.props.accounts.length === 0) {
      trackEvent("OnboardingStart");
    }
  }

  componentWillUnmount() {
    clearInterval(this.getNewEmailsInterval);
    if (keyboard.emailsApp === this) {
      keyboard.emailsApp = null;
    }
  }

  // First visible thread in the first non-empty column — used by the keyboard
  // to enter keyboard mode when an arrow key is pressed with nothing selected.
  getFirstThreadComponent() {
    for (const ref of this.columnRefs) {
      const column = ref?.getDecoratedComponentInstance();
      const threads = column && collectVisibleThreadComponents(column.threadRefs);
      if (threads && threads.length > 0) {
        return threads[0];
      }
    }
  }

  componentDidUpdate(prevProps: ISettings) {
    const prevIDs = _.map(prevProps.accounts, a => a.id);
    const ids = _.map(this.props.accounts, a => a.id);

    const added = _.without(ids, ...prevIDs);
    added.forEach(id => {
      mainEmailStore.onAddAccount(id);
      filterStore.getAccountFolderNames(id);
    });

    const removed = _.without(prevIDs, ...ids);
    // TODO
  }

  getNewEmailsLoop = async () => {
    if (this.props.accounts.length === 0) {
      return;
    }
    const folderNames = this.getFoldersToSync();
    console.info(`[EmailsApp] New emails sync for current folders: ${folderNames}`);
    const start = performance.now();

    for (let i = 0; i < folderNames.length; i++) {
      const folder = folderNames[i];
      const columnMetaStore = getColumnMetaStore(folder);
      if (columnMetaStore.props.isSyncing) {
        console.debug(`[EmailsApp] Not syncing ${folder} as we are already syncing!`);
      } else {
        await mainEmailStore.syncFolderEmails(folder, {});
      }
    }

    // Reschedule the next loop call
    const duration = performance.now() - start;
    const nextSyncTime = settingsStore.props.system.syncInterval - Math.round(duration);
    console.info(`[EmailsApp] Scheduled next new emails sync for ${nextSyncTime}ms`);
    setTimeout(this.getNewEmailsLoop, nextSyncTime);
  };

  renderColumns() {
    const columnElements: React.ReactElement[] = [];
    this.columnRefs = [];

    const getColumn = (id) => {
      const column = this.columnRefs[id];

      if (column) {
        // Email columns are wrapped dynamically with their store so
        // fetch the underlying column.
        // @ts-ignore
        return column.getDecoratedComponentInstance();
      }
    };

    const columns = settingsStore.getCurrentColumns();

    _.each(columns, (columnName, i) => {
      const getPreviousColumn = () => getColumn(i - 1);
      const getNextColumn = () => getColumn(i + 1);

      columnElements.push(
        // @ts-ignore
        <EmailColumn
          key={i}
          id={columnName}
          index={i}
          getPreviousColumn={getPreviousColumn}
          getNextColumn={getNextColumn}
          ref={(ref) => (this.columnRefs[i] = ref)}
        />
      );
    });

    // Special far-right column showing search results from archive/trash,
    // registered as the last column ref so keyboard navigation reaches it
    columnElements.push(
      <SearchResultsColumn
        key="search-results"
        getPreviousColumn={() => getColumn(columns.length - 1)}
        getNextColumn={() => undefined}
        ref={(ref) => (this.columnRefs[columns.length] = ref)}
      />
    );

    return columnElements;
  }

  renderToolbar() {
    return (
      <div className="km-toolbar" data-tauri-drag-region>
        <WorkflowSwitcher />
        <div className="km-toolbar-divider"></div>
        {/* @ts-ignore */}
        <Search />
        <div className="header-errors-anchor"></div>
        <div className="spacer" data-tauri-drag-region></div>
        <Tooltip
          text={<span>Compose (<i className="fa fa-keyboard-o" /> c)</span>}
          position="left"
        >
          <button
            className="btn-primary"
            onClick={() => {
              AppService.OpenSendWindow({});
              trackEvent("ToolbarOpenSend");
            }}
          >
            <i className="fa fa-pencil-square-o"></i>
            Compose
          </button>
        </Tooltip>
      </div>
    );
  }

  renderColumnsSection() {
    return (
      <section
        id="columns"
      // className={
      //   this.props.styleSettings.compact_columns ? "compact" : undefined
      // }
      >
        {this.renderToolbar()}
        <div className="km-columns-row">
          {this.renderColumns()}
          <OnboardingColumnsPanel />
          <AddNewColumnForm />
        </div>
      </section>
    );
  }

  render() {
    if (this.props.accounts.length === 0) {
      return <WelcomeSettings />;
    }

    return (
      <section>
        {/* @ts-ignore */}
        <Sidebar />
        {this.renderColumnsSection()}
        <Thread />
        {/* @ts-ignore */}
        <CommandBar />
        {/* @ts-ignore */}
        <Cheatsheet />
      </section>
    );
  }
}
