import _ from "lodash";

import EmailColumn from "../components/emails/EmailColumn.tsx";
import EmailColumnThread from "../components/emails/EmailColumnThread.tsx";
import { getColumnStore } from "../stores/columns.ts";
import { getEmailStore } from "../stores/emails/controller.ts";
import requestStore from "../stores/request.ts";
import settingsStore from "../stores/settings.ts";

export function moveOrCopyThread(
  moveData,
  targetFolder,
  setIsMovingFunction: any = null
) {
  setIsMovingFunction =
    setIsMovingFunction || moveData.sourceThreadComponent.setIsMoving;
  // @ts-ignore
  setIsMovingFunction();

  const { messageUids, oldColumn, accountName, thread } = moveData;
  const emailStore = getEmailStore();

  const accountSettings = settingsStore.getAccountSettings(accountName);
  const handler =
    accountSettings!.settings.copyFromInbox === true && oldColumn == "inbox"
      ? emailStore.copyEmails
      : emailStore.moveEmails;

  const targetColumnStore = getColumnStore(targetFolder);
  targetColumnStore.addIncomingThread(thread);

  const undoMove = () => {
    moveData.sourceThreadComponent.undoSetIsMoving();
    targetColumnStore.removeIncomingThread(thread);
  };

  const moveThread = () => {
    handler(accountName, messageUids, oldColumn, targetFolder).then(() => {
      emailStore.syncFolderEmails(oldColumn, { accountNames: [accountName] });
      emailStore
        .syncFolderEmails(targetFolder, {
          accountNames: [accountName],
        })
        .then(() => targetColumnStore.removeIncomingThread(thread));
    });
  };

  requestStore.addUndoable(moveThread, undoMove);
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
  const { accountName } = props.thread[0];

  // Get list of message UIDs *for this folder*
  const messageUids = getThreadColumnMessageIds(props.thread, props.columnId);

  return {
    messageUids: messageUids,
    oldColumn: props.columnId,
    accountName: accountName,
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

function collectVisibleThreadComponents(threadRefs) {
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
    }

    const sourceColumn = sourceComponent.props.column;
    const visibleSourceThreads = collectVisibleThreadComponents(
      sourceColumn.threadRefs
    );

    let wantedSourceThreadRef = visibleSourceThreads.indexOf(sourceComponent);

    if (wantedSourceThreadRef >= 0) {
      if (wantedSourceThreadRef > visibleTargetThreads.length - 1) {
        wantedSourceThreadRef = visibleTargetThreads.length - 1;
      }
      return visibleTargetThreads[wantedSourceThreadRef];
    }
  }
}

export const getNextColumnThreadComponent = (thread) =>
  getColumnThreadComponent(thread, "getNextColumn");
export const getPreviousColumnThreadComponent = (thread) =>
  getColumnThreadComponent(thread, "getPreviousColumn");
