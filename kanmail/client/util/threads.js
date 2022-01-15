import _ from 'lodash';

import requestStore from 'stores/request.js';
import settingsStore from 'stores/settings.js';
import { getColumnStore } from 'stores/columns.js';
import { getEmailStore } from 'stores/emailStoreProxy.js';

export function moveOrCopyThread(moveData, targetFolder, setIsMovingFunction=null) {
    setIsMovingFunction = setIsMovingFunction || moveData.sourceThreadComponent.setIsMoving;
    setIsMovingFunction();

    const { messageUids, oldColumn, accountName, thread } = moveData;
    const emailStore = getEmailStore();

    const accountSettings = settingsStore.getAccountSettings(accountName);
    const handler =
        accountSettings.folders.copy_from_inbox === true && oldColumn == 'inbox' ?
        emailStore.copyEmails : emailStore.moveEmails;

    const targetColumnStore = getColumnStore(targetFolder);
    targetColumnStore.addIncomingThread(thread);

    const undoMove = () => {
        moveData.sourceThreadComponent.undoSetIsMoving();
        targetColumnStore.removeIncomingThread(thread);
    }

    const moveThread = () => {
        handler(accountName, messageUids, oldColumn, targetFolder).then(() => {
            emailStore.syncFolderEmails(
                oldColumn,
                {accountName: accountName},
            );
            emailStore.syncFolderEmails(
                targetFolder,
                {
                    accountName: accountName,
                    // Tell the backend to expect X messages (and infer if needed!)
                    query: {uid_count: messageUids.length},
                },
            ).then(() => targetColumnStore.removeIncomingThread(thread));
        });
    }

    requestStore.addUndoable(moveThread, undoMove);
}


/*
    Return a list of UIDs for a given folder in this thread.
*/
export function getThreadColumnMessageIds(thread, columnId) {
    return _.filter(_.map(thread, message => (
        message.folderUids[columnId]
    )));
}


export function getMoveDataFromThreadComponent(component) {
    const { props } = component;

    // Get account name from the first message in the thread
    const { account_name } = props.thread[0];

    // Get list of message UIDs *for this folder*
    const messageUids = getThreadColumnMessageIds(
        props.thread,
        props.columnId,
    );

    return {
        messageUids: messageUids,
        oldColumn: props.columnId,
        accountName: account_name,
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

export const getNextThreadComponent = (thread) => getThreadComponent(thread, 'getNextThread');
export const getPreviousThreadComponent = (thread) => getThreadComponent(thread, 'getPreviousThread');


function collectVisibleThreadComponents(threadRefs) {
    return _.reduce(
        threadRefs,
        (memo, value) => {
            if (value) {
                const component = value.getDecoratedComponentInstance();
                if (!component.isBusy()) {
                    memo.push(component);
                }
            }
            return memo;
        },
        [],
    );
}

function getColumnThreadComponent(sourceComponent, propName, targetColumn=null) {
    if (!targetColumn) {
        targetColumn = sourceComponent.props[propName]();
    }

    if (targetColumn) {
        const visibleTargetThreads = collectVisibleThreadComponents(targetColumn.threadRefs);

        // If the target column is empty, attempt to skip to the column after it
        if (visibleTargetThreads.length <= 0) {
            const nextTargetColumn = targetColumn.props[propName]();
            if (nextTargetColumn) {
                return getColumnThreadComponent(sourceComponent, propName, nextTargetColumn);
            }
        }

        const sourceColumn = sourceComponent.props.column;
        const visibleSourceThreads = collectVisibleThreadComponents(sourceColumn.threadRefs);

        let wantedSourceThreadRef = visibleSourceThreads.indexOf(sourceComponent);

        if (wantedSourceThreadRef >= 0) {
            if (wantedSourceThreadRef > visibleTargetThreads.length - 1) {
                wantedSourceThreadRef = visibleTargetThreads.length - 1;
            }
            return visibleTargetThreads[wantedSourceThreadRef];
        }
    }
}

export const getNextColumnThreadComponent = (thread) => getColumnThreadComponent(thread, 'getNextColumn');
export const getPreviousColumnThreadComponent = (thread) => getColumnThreadComponent(thread, 'getPreviousColumn');
