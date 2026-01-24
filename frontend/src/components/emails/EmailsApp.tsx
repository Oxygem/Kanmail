import _ from "lodash";
import React from "react";
import { DragDropContext } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { ALWAYS_SYNC_FOLDERS, INBOX } from "../../constants.ts";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import { getColumnMetaStore, getColumnStore } from "../../stores/columns.ts";
import mainEmailStore from "../../stores/emails/main.ts";
import filterStore from "../../stores/filters.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import { trackEvent } from "../../util/analytics.ts";
import { createWindowPositionHandlers } from "../../window.ts";
import AddNewColumnForm from "./AddNewColumnForm.tsx";
import ControlInput from "./ControlInput.jsx";
import EmailColumn from "./EmailColumn.tsx";
import Search from "./Search.jsx";
import Sidebar from "./Sidebar.jsx";
import Thread from "./Thread.jsx";
import WelcomeSettings from "./WelcomeSettings.jsx";

@subscribe(settingsStore)
@DragDropContext(HTML5Backend)
export default class EmailsApp extends React.Component<ISettings> {
  getNewEmailsInterval: NodeJS.Timeout;

  getFoldersToSync() {
    return _.concat(
      // Inbox + columns first since these are displayed
      [INBOX],
      settingsStore.getCurrentColumns(),
      // Then the most common folders and any pinned sidebar folders
      ALWAYS_SYNC_FOLDERS,
      settingsStore.props.sidebarFolders,
    );
  }

  componentDidMount() {
    // Enable keyboard controls
    if (this.props.accounts.length > 0) {
      keyboard.enable();
    }

    // Create resize/move window position saver handlers
    createWindowPositionHandlers();

    // Kick off license + update checks
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

    // Bootstrap (init + sync) the folders we optimistically sync that aren't currently shown
    const hiddenFolders = _.without(
      this.getFoldersToSync(),
      ...settingsStore.getCurrentColumns(),
    );
    setTimeout(async () => {
      for (let i = 0; i < hiddenFolders.length; i++) {
        getColumnStore(hiddenFolders[i]);
        await mainEmailStore.onShowFolder(hiddenFolders[i]);
      }
    }, 1000);


    // Kick off a folders load for each account
    setTimeout(() => {
      this.props.accounts.forEach(a => filterStore.getAccountFolderNames(a.name))
    }, 2000);

    // Kick off new emails loop
    setTimeout(this.getNewEmailsLoop, settingsStore.props.system.syncInterval);

    trackEvent("EmailsAppMounted");
    if (this.props.accounts.length === 0) {
      trackEvent("OnboardingStart");
    }
  }

  componentWillUnmount() {
    clearInterval(this.getNewEmailsInterval);
  }

  getNewEmailsLoop = async () => {
    const folderNames = this.getFoldersToSync();
    console.info(`[EmailsApp] New emails sync for current folders: ${folderNames}`);
    const start = performance.now();

    for (let i = 0; i < folderNames.length; i++) {
      const folder = folderNames[i];
      const columnMetaStore = getColumnMetaStore(folder);
      if (columnMetaStore.props.isSyncing) {
        console.debug(`[EmailsApp] Not syncing ${folder} as we are already syncing!`);
        return;
      }
      await mainEmailStore.syncFolderEmails(folder, {});
    }

    // Reschedule the next loop call
    const duration = performance.now() - start;
    const nextSyncTime = settingsStore.props.system.syncInterval - Math.round(duration);
    console.info(`[EmailsApp] Scheduled next new emails sync for ${nextSyncTime}ms`);
    setTimeout(this.getNewEmailsLoop, nextSyncTime);
  };

  renderColumns() {
    const columnElements = [];
    const columnRefs: (EmailColumn | null)[] = [];

    const getColumn = (id) => {
      const column = columnRefs[id];

      if (column) {
        // Email columns are wrapped dynamically with their store so
        // fetch the underlying column.
        // @ts-ignore
        return column.getDecoratedComponentInstance();
      }
    };

    const columns = settingsStore.getCurrentColumns();
    if (columns.length == 0) {
      columns.push("inbox");
    }

    _.each(columns, (columnName, i) => {
      const getPreviousColumn = () => getColumn(i - 1);
      const getNextColumn = () => getColumn(i + 1);

      columnElements.push(
        // @ts-ignore
        <EmailColumn
          key={columnName}
          id={columnName}
          getPreviousColumn={getPreviousColumn}
          getNextColumn={getNextColumn}
          ref={(ref) => (columnRefs[i] = ref)}
        />
      );
    });

    return columnElements;
  }

  renderColumnsSection() {
    return (
      <section
        id="columns"
      // className={
      //   this.props.styleSettings.compact_columns ? "compact" : undefined
      // }
      >{/* @ts-ignore */}
        <Search />
        {this.renderColumns()}
        <AddNewColumnForm />
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
        <ControlInput />
      </section>
    );
  }
}
