import _ from "lodash";
import React from "react";
import { DragDropContext } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { ALWAYS_SYNC_FOLDERS, INBOX } from "../../constants.ts";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import { getColumnMetaStore } from "../../stores/columns.ts";
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
  newAliasEmailCheck: NodeJS.Timeout;

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
    if (!_.isEmpty(this.props.accounts)) {
      keyboard.enable();
    }

    // Create resize/move window position saver handlers
    createWindowPositionHandlers();

    // Kick off a folders load for each account
    this.props.accounts.forEach(a => filterStore.getAccountFolderNames(a.name))

    // Kick off license + update checks
    systemStore.checkLicense();
    systemStore.checkUpdate();
    // Recheck every 24h
    setInterval(
      () => {
        systemStore.checkUpdate();
        systemStore.checkUpdate();
      },
      1000 * 3600 * 24,
    );

    this.newAliasEmailCheck = setInterval(
      this.getNewEmails,
      settingsStore.props.system.syncInterval,
    );

    trackEvent("EmailsAppMounted")
  }

  componentWillUnmount() {
    clearInterval(this.newAliasEmailCheck);
  }

  getNewEmails = () => {
    const folderNames = settingsStore.getCurrentColumns();
    console.info(`Resyncing current folders: ${folderNames}`);

    _.map(folderNames, (folder) => {
      const columnMetaStore = getColumnMetaStore(folder);
      if (columnMetaStore.props.isSyncing) {
        console.debug(`Not syncing ${folder} as we are already syncing!`);
        return;
      }
      mainEmailStore.syncFolderEmails(folder, {});
    });
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
    if (_.isEmpty(this.props.accounts)) {
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
