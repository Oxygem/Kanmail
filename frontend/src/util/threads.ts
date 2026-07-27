import _ from "lodash";

import EmailColumn from "../components/emails/EmailColumn.tsx";
import EmailColumnThread from "../components/emails/EmailColumnThread.tsx";
import { ALIAS_FOLDERS } from "../constants.ts";
import { getColumnStore } from "../stores/columns.ts";
import { CommandOption } from "../stores/command.ts";
import { getEmailStore } from "../stores/emails/controller.ts";
import filterStore from "../stores/filters.ts";
import requestStore from "../stores/request.ts";
import settingsStore from "../stores/settings.ts";
import { capitalizeFirstLetter } from "./string.js";

export function moveOrCopyThread(
  moveData,
  targetFolder,
  setIsMovingFunction: any = null
) {
  setIsMovingFunction =
    setIsMovingFunction || moveData.sourceThreadComponent.setIsMoving;
  // @ts-ignore
  setIsMovingFunction();

  const { messageUids, oldColumn, accountID, thread } = moveData;
  const emailStore = getEmailStore();

  const accountSettings = settingsStore.getAccountSettings(accountID);
  // Copy-from-inbox only applies when filing into a workflow column (eg a
  // label), leaving the original in the inbox. Moving to an alias folder
  // (archive/trash/etc) or any other folder is always a real move.
  const targetIsWorkflowColumn =
    _.includes(settingsStore.getAllColumns(), targetFolder) &&
    !_.includes(ALIAS_FOLDERS, targetFolder);
  const handler =
    accountSettings!.settings.copyFromInbox === true &&
    oldColumn == "inbox" &&
    targetIsWorkflowColumn
      ? emailStore.copyEmails
      : emailStore.moveEmails;

  const sourceColumnStore = getColumnStore(oldColumn);
  sourceColumnStore.hideThread(thread);

  const targetColumnStore = getColumnStore(targetFolder);
  targetColumnStore.addIncomingThread(thread);

  const undoMove = () => {
    moveData.sourceThreadComponent.undoSetIsMoving();
    sourceColumnStore.showThread(thread);
    targetColumnStore.removeIncomingThread(thread);
  };

  const moveThread = () => {
    handler(accountID, messageUids, oldColumn, targetFolder)
      .then(() => {
        emailStore.syncFolderEmails(oldColumn, { accountIDs: [accountID] });
        emailStore
          .syncFolderEmails(targetFolder, {
            accountIDs: [accountID],
          })
          .then(() => targetColumnStore.removeIncomingThread(thread));
      })
      .catch((e) => {
        // Nothing moved server side, so roll the UI back rather than leaving the
        // thread hidden in the source column and stuck incoming in the target
        undoMove();
        requestStore.addError(
          `Failed to move to ${capitalizeFirstLetter(targetFolder)}`,
          e
        );
      });
  };

  requestStore.addUndoable(
    `Move to ${capitalizeFirstLetter(targetFolder)}`,
    moveThread,
    undoMove
  );
}

/*
    Return a list of UIDs for a given folder in this thread.
*/
export function getThreadColumnMessageIds(thread, columnId) {
  return _.filter(_.map(thread, (message) => message.folderUids[columnId]));
}

export function getMoveDataFromThreadComponent(component) {
  const { props } = component;

  // Get account name from the first message in the thread
  const { accountID } = props.thread[0];

  // Get list of message UIDs *for this folder*
  const messageUids = getThreadColumnMessageIds(props.thread, props.columnId);

  return {
    messageUids: messageUids,
    oldColumn: props.columnId,
    accountID: accountID,
    sourceThreadComponent: component,
    thread: props.thread,
  };
}

function getThreadComponent(sourceComponent, propName) {
  let component;

  while (sourceComponent) {
    const nextComponent = sourceComponent.props[propName]();

    if (!nextComponent || !nextComponent.isBusy()) {
      component = nextComponent;
      break;
    }

    sourceComponent = nextComponent;
  }

  return component;
}

export const getNextThreadComponent = (thread) =>
  getThreadComponent(thread, "getNextThread");
export const getPreviousThreadComponent = (thread) =>
  getThreadComponent(thread, "getPreviousThread");

export function collectVisibleThreadComponents(threadRefs) {
  return _.reduce(
    threadRefs,
    (memo: EmailColumnThread[], value) => {
      if (value) {
        const component: EmailColumnThread = value.getDecoratedComponentInstance();
        if (!component) {
          console.log("ERR COMPONENT", value);
          return memo;
        }
        if (!component.isBusy()) {
          memo.push(component);
        }
      }
      return memo;
    },
    []
  );
}

function getColumnThreadComponent(
  sourceComponent,
  propName,
  targetColumn: EmailColumn | null = null
) {
  if (!targetColumn) {
    targetColumn = sourceComponent.props[propName]();
  }

  if (targetColumn) {
    const visibleTargetThreads = collectVisibleThreadComponents(
      targetColumn.threadRefs
    );

    // If the target column is empty, attempt to skip to the column after it
    if (visibleTargetThreads.length <= 0) {
      const nextTargetColumn = targetColumn.props[propName]();
      if (nextTargetColumn) {
        return getColumnThreadComponent(
          sourceComponent,
          propName,
          nextTargetColumn
        );
      }
      return;
    }

    // Columns scroll independently, so the same list index can be way off
    // screen in the target column — pick the thread nearest on screen instead.
    const sourceRect = sourceComponent.element?.getBoundingClientRect();
    if (!sourceRect) {
      return visibleTargetThreads[0];
    }
    const sourceCenter = sourceRect.top + sourceRect.height / 2;

    return _.minBy(visibleTargetThreads, (thread) => {
      const rect = thread.element?.getBoundingClientRect();
      if (!rect) {
        return Infinity;
      }
      return Math.abs(rect.top + rect.height / 2 - sourceCenter);
    });
  }
}

export const getNextColumnThreadComponent = (thread) =>
  getColumnThreadComponent(thread, "getNextColumn");
export const getPreviousColumnThreadComponent = (thread) =>
  getColumnThreadComponent(thread, "getPreviousColumn");

// Context-aware suggested folders based on where the email currently is
const SUGGESTED_TARGETS: Record<string, string[]> = {
  inbox: ["archive", "trash", "junk"],
  archive: ["inbox", "trash"],
  trash: ["inbox", "archive"],
  junk: ["inbox", "trash"],
  sent: ["archive", "trash"],
  drafts: ["inbox", "trash"],
};

function makeFolderOption(folderName: string) {
  const isAlias = ALIAS_FOLDERS.includes(folderName);
  return {
    value: folderName,
    label: isAlias ? capitalizeFirstLetter(folderName) : folderName,
  };
}

export function buildAddColumnOptions(): CommandOption[] {
  const current = settingsStore.getCurrentColumns();
  const all = _.uniq([
    ...ALIAS_FOLDERS,
    ...(filterStore.props.folderNames || []),
  ]);
  return _.without(all, ...current).map(makeFolderOption);
}

/*
    Build a smart-ordered list of folder options for move/copy, grouped by relevance:
    1. Suggested — context-aware picks based on the source folder
    2. Columns — folders in the user's current column layout
    3. Other — everything else, alphabetically sorted
    The current folder is excluded from all groups.
*/
export function buildMoveFolderOptions(currentFolder: string) {
  const allFolders = _.uniq([
    ...ALIAS_FOLDERS,
    ...filterStore.props.folderNames,
  ]);

  // Remove the folder the thread is already in
  const available = allFolders.filter((f) => f !== currentFolder);

  const suggested = (SUGGESTED_TARGETS[currentFolder] || []).filter((f) =>
    available.includes(f)
  );

  const columns = settingsStore.getCurrentColumns().filter(
    (f) => available.includes(f) && !suggested.includes(f)
  );

  const sidebarFolders = (settingsStore.props.sidebarFolders || []).filter(
    (f) => available.includes(f) && !suggested.includes(f) && !columns.includes(f)
  );

  const placed = new Set([...suggested, ...columns, ...sidebarFolders]);
  const other = available.filter((f) => !placed.has(f)).sort();

  const groups: { label: string; options: { value: string; label: string }[] }[] = [];

  if (suggested.length > 0) {
    groups.push({
      label: "Suggested",
      options: suggested.map(makeFolderOption),
    });
  }
  if (columns.length > 0) {
    groups.push({
      label: "Columns",
      options: columns.map(makeFolderOption),
    });
  }
  if (sidebarFolders.length > 0) {
    groups.push({
      label: "Sidebar",
      options: sidebarFolders.map(makeFolderOption),
    });
  }
  if (other.length > 0) {
    groups.push({
      label: "Other",
      options: other.map(makeFolderOption),
    });
  }

  return groups;
}
