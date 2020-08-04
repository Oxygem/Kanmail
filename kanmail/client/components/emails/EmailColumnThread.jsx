import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { DragSource } from 'react-dnd';

import { ALIAS_FOLDERS } from 'constants.js';

import keyboard from 'keyboard.js';

import requestStore from 'stores/request.js';
import threadStore from 'stores/thread.js';
import { getEmailStore } from 'stores/emailStoreProxy.js';
import { getColumnStore } from 'stores/columns.js';

import { getAccountIconName } from 'util/accounts.js';
import { formatAddress, formatDate } from 'util/string.js';
import {
    getThreadColumnMessageIds,
    getMoveDataFromThreadComponent,
} from 'util/threads.js';


/*
    Return a map of folder -> UIDs for all messages in this thread.
*/
function getThreadFolderMessageIds(thread) {
    return _.reduce(
        thread,
        (memo, message) => {
            _.each(message.folderUids, (uid, folderName) => {
                if (!memo[folderName]) {
                    memo[folderName] = [];
                }

                memo[folderName].push(uid);
            });

            return memo;
        },
        {},
    );
}


const emailSource = {
    beginDrag: (props, monitor, component) => {
        return getMoveDataFromThreadComponent(component);
    }
};


function collect(connect, monitor) {
    return {
        connectDragSource: connect.dragSource(),
        isDragging: monitor.isDragging(),
    }
}


@DragSource('email', emailSource, collect)
export default class EmailColumnThread extends React.Component {
    static propTypes = {
        thread: PropTypes.array.isRequired,
        connectDragSource: PropTypes.func.isRequired,
        columnId: PropTypes.string.isRequired,
        threadRef: PropTypes.number.isRequired,
        isLastThread: PropTypes.bool.isRequired,

        // Surrounding columns
        getColumnContainer: PropTypes.func.isRequired,
        getPreviousColumn: PropTypes.func.isRequired,
        getNextColumn: PropTypes.func.isRequired,

        // Surrounding threads
        getPreviousThread: PropTypes.func.isRequired,
        getNextThread: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);

        const { starred, archived, deleted } = this.props.thread;
        let { unread } = this.props.thread;

        // Read the emails via the column store, just in case we re-render the column
        if (getColumnStore(this.props.columnId).hasReadThread(this.props.thread)) {
            unread = false;
        }

        this.mouseMoveEvents = 0;

        this.state = {
            starred: starred,
            unread: unread,
            archived: archived,
            deleted: deleted,
            // Visual/error state
            open: false,
            hover: false,
            error: false,
            // Locking/executing state
            locked: false,
            archiving: false,
            trashing: false,
            restoring: false,
            moving: false,
        }
    }

    componentDidUpdate(prevProps) {
        // If we're open and the thread changed, reopen
        if (
            this.state.open
            && prevProps.thread.length !== this.props.thread.length
        ) {
            // Mark the emails as read in the global email store
            if (this.state.unread) {
                getEmailStore().setEmailsRead(_.map(this.props.thread, message => (
                    `${message.account_name}-${message.message_id}`
                )));
            }
            this.setState({
                unread: false,
            });

            threadStore.loadThread(this.props.thread);
        }

        // We want to detect when *props update*, but not state. This effectively
        // reimplements the deprecated & "unsafe" componentWillReceiveProps.
        const prevThreadProps = _.pick(prevProps.thread, ['starred', 'unread', 'archived']);
        const threadProps = _.pick(this.props.thread, ['starred', 'unread', 'archived']);
        if (_.isEqual(prevThreadProps, threadProps)) {
            return;
        }

        // If our state doesn't match the latest props, update
        const { starred, unread, archived } = this.props.thread;
        if (
            this.state.starred !== starred
            || this.state.unread !== unread
            || this.state.archived !== archived
        ) {
            this.setState({unread, starred, archived});
        }
    }

    componentWillUnmount() {
        if (this.state.hover) {
            keyboard.setThreadComponent(null);
        }
    }

    setHover = (state=true) => {
        this.setState({
            hover: state,
        });

        if (!state) {
            this.mouseMoveEvents = 0;
        }
    }

    setIsMoving = () => {
        this.setState({
            moving: true,
            locked: true,
        });
    }

    isBusy = () => {
        return this.state.locked;
    }

    /*
        Hover states/handling
    */
    handleMouseMove = () => {
        // This is an awful hack around mouseMove being triggered when the
        // parent (column) is scrolled.
        this.mouseMoveEvents += 1;
        if (this.mouseMoveEvents <= 1) {
            return;
        }

        if (this.isBusy() || this.state.hover || threadStore.isOpen) {
            return;
        }

        keyboard.setThreadComponent(this);
    }

    handleMouseLeave = () => {
        if (this.isBusy() || threadStore.isOpen) {
            return;
        }

        if (this.state.hover) {
            keyboard.setThreadComponent(null);
        }
    }

    /*
        User action handlers
    */
    handleClick = () => {
        if (this.state.open) {
            threadStore.close();
            return;
        }

        if (!this.state.hover) {
            keyboard.setThreadComponent(this);
        }

        // Mark the emails as read in the global email store
        if (this.state.unread) {
            getEmailStore().setEmailsRead(_.map(
                this.props.thread,
                email => email.accountMessageId,
            ));

            // Read the emails via the column store, just in case we re-render the column
            const columnStore = getColumnStore(this.props.columnId);
            columnStore.readThread(this.props.thread);
        }

        // Set as open (triggers highlight)
        this.setState({
            open: true,
            unread: false,
        });

        threadStore.open(
            this,
            this.props.thread,
            // On close set this thread to an unopened state
            () => {
                this.setState({
                    open: false,
                });
            },
        );
    }

    handleClickStar = (ev) => {
        ev.stopPropagation();

        if (this.state.locked) {
            console.debug('Thread locked, not starring!');
        }

        this.setState({
            starring: true,
            locked: true,
        });

        // Only star messages from this thread in the current column/folder
        const messageUids = getThreadColumnMessageIds(
            this.props.thread,
            this.props.columnId,
        );

        // Star the emails in the store - but don't sync the changes everywhere
        // instead we keep the starred state local to this component, to avoid
        // re-rendering the whole column.
        const emailStore = getEmailStore();
        let action = this.state.starred ? emailStore.unstarEmails : emailStore.starEmails;
        action = action.bind(emailStore);  // fucking JavaScript

        action(
            this.props.thread[0].account_name,
            this.props.columnId,
            messageUids,
        ).then(() => {
            this.setState({
                locked: false,
                starring: false,
                starred: !this.state.starred,
            });
        });
    }

    /*
        For every message in this thread, *any folder*, generate a move request
        to another folder.
    */
    moveThreadMessages = (targetFolder, previousState, folderFilter=null) => {
        const emailStore = getEmailStore();

        const thread = this.props.thread;
        const accountKey = thread[0].account_name;

        const allMessageFolderUids = _.pickBy(
            getThreadFolderMessageIds(thread),
            (uids, folderName) => folderFilter === null || folderFilter(folderName)
        );

        // Hide the emails via the store, just in case we re-render the column
        const columnStore = getColumnStore(this.props.columnId);
        columnStore.hideThread(thread);

        const undoMove = (extraState={}) => {
            // Unhide the emails via the store, reverting above
            columnStore.showThread(thread);

            if (this.element) {
                this.setState({
                    ...previousState,
                    ...extraState,
                });
            } else {
                columnStore.triggerUpdate();
            }
        }

        const moveThread = () => {
            const requests = [];

            _.each(allMessageFolderUids, (uids, folderName) => {
                requests.push(emailStore.moveEmails(
                    accountKey,
                    uids,
                    folderName,
                    targetFolder,
                ));
            });

            return Promise.all(requests).then(() => {
                emailStore.processEmailChanges({noTriggerUpdate: true});
            }).catch((e) => {
                undoMove({error: true});
                throw e;  // re-throw for the requestStore to capture
            });
        }

        requestStore.addUndoable(moveThread, undoMove);
    }

    handleClickArchive = (ev) => {
        ev.stopPropagation();

        // No double archiving please!
        if (this.state.locked) {
            console.debug('Thread locked, not archiving!');
            return;
        }

        this.setState({
            archiving: true,
            locked: true,
        });

        const previousState = {
            archiving: false,
            locked: false,
        };

        this.moveThreadMessages(
            'archive', previousState,
            folderName => folderName == 'inbox' || !_.includes(ALIAS_FOLDERS, folderName),
        );
    }

    handleClickTrash = (ev) => {
        ev.stopPropagation();

        if (this.props.columnId === 'trash') {
            console.debug('Thread already trashed!');
            return;
        }

        // No double trashing please!
        if (this.state.locked) {
            console.debug('Thread locked, not trashing!');
            return;
        }

        this.setState({
            trashing: true,
            locked: true,
        });

        const previousState = {
            trashing: false,
            locked: false,
        };

        this.moveThreadMessages('trash', previousState);
    }

    handleClickRestore = (ev) => {
        ev.stopPropagation();

        if (this.props.columnId === 'inbox') {
            console.debug('Thread already in inbox!');
            return;
        }

        if (this.state.hover) {
            keyboard.setThreadComponent(null);
        }

        // No double trashing please!
        if (this.state.restoring) {
            console.debug('Thread locked, not restoring!');
            return;
        }

        this.setState({
            restoring: true,
            locked: true,
        });

        const previousState = {
            restoring: false,
            locked: false,
        };

        this.moveThreadMessages(
            'inbox', previousState,
            folderName => folderName == this.props.columnId,
        );
    }

    /*
        Render
    */
    renderStarButton() {
        if (_.includes(['trash', 'spam'], this.props.columnId)) {
            return;
        }

        const classNames = ['fa'];

        if (this.state.starring) {
            classNames.push('fa-cog');
            classNames.push('fa-spin');
        } else {
            if (this.state.starred) {
                classNames.push('fa-star');
            } else {
                classNames.push('fa-star-o');
            }
        }

        return (
            <a
                onClick={this.handleClickStar}
                className={`star ${this.state.starred ? 'active' : ''}`}
            >
                <i className={classNames.join(' ')}></i>
            </a>
        );
    }

    renderArchiveButton() {
        if (_.includes(
            ['trash', 'spam', 'archive', 'drafts'],
            this.props.columnId,
        )) {
            return;
        }

        const classNames = ['fa'];

        if (this.state.archiving) {
            classNames.push('fa-cog');
            classNames.push('fa-spin');
        } else {
            classNames.push('fa-archive');
        }

        return (
            <a
                onClick={keyboard.archiveCurrentThread}
                className='archive'
            >
                <i className={classNames.join(' ')}></i>
            </a>
        );
    }

    renderRestoreButton() {
        if (!_.includes(['trash', 'spam'], this.props.columnId)) {
            return;
        }

        const classNames = ['fa'];

        if (this.state.restoring) {
            classNames.push('fa-cog');
            classNames.push('fa-spin');
        } else {
            classNames.push('fa-inbox');
        }

        return (
            <a
                onClick={this.handleClickRestore}
                className='archive'
            >
                <i className={classNames.join(' ')}></i>
            </a>
        );
    }

    renderTrashButton() {
        if (this.props.columnId === 'trash') {
            return;
        }

        const classNames = ['fa'];

        if (this.state.trashing) {
            classNames.push('fa-cog');
            classNames.push('fa-spin');
        } else {
            classNames.push('fa-trash');
        }

        return (
            <a
                onClick={keyboard.trashCurrentThread}
                className='trash'
            >
                <i className={classNames.join(' ')}></i>
            </a>
        );
    }

    renderAttachmentCount() {
        const attachmentCount = _.reduce(this.props.thread, (memo, message) => {
            const count = message.parts.attachments.length || 0;
            memo += count;
            return memo;
        }, 0);

        if (attachmentCount === 0) {
            return;
        }

        return (
            <span>
                &nbsp;/&nbsp;
                <i className="fa fa-paperclip"></i> {attachmentCount}
            </span>
        );
    }

    render() {
        const { connectDragSource, thread } = this.props;
        const latestEmail = thread[0];

        const uniqueSubjects = _.uniq(_.map(thread, message => message.subject));
        const subject = thread.mergedThreads ? uniqueSubjects.join(', ') : latestEmail.subject;

        const uniqueAddresses = _.uniqBy(
            _.reduce(this.props.thread, (memo, message) => {
                memo = _.concat(memo, _.map(message.from, address => address));
                return memo;
            }, []),
            address => address[1],
        );

        const addresses = _.map(
            uniqueAddresses,
            address => formatAddress(address, true),
        ).join(', ');

        const classNames = ['email'];

        _.each(['hover', 'unread', 'open', 'error'], key => {
            if (this.state[key]) {
                classNames.push(key);
            }
        });

        if (this.state.archiving || this.state.trashing || this.state.moving) {
            classNames.push('archiving');
        }

        if (this.state.trashing) {
            classNames.push('trashing');
        }

        if (this.state.archived) {
            classNames.push('archived');
        }

        return connectDragSource(
            <div
                className={classNames.join(' ')}
                onClick={this.handleClick}
                onMouseMove={this.handleMouseMove}
                onMouseLeave={this.handleMouseLeave}
                ref={(ref) => this.element = ref}
            >
                <h5>
                    <span className="date">
                        {formatDate(latestEmail.date)}
                    </span>
                    {addresses}
                </h5>
                <h4>
                    {thread.mergedThreads && <span className="multi-subject tooltip-wrapper">
                        x{thread.mergedThreads}
                        <span className="tooltip">{thread.mergedThreads} merged threads</span>
                    </span>}
                    <span className="subject">
                        {this.state.deleted ? <strike>{subject}</strike> : subject}
                    </span>
                </h4>
                <p>{latestEmail.excerpt}</p>
                <div className="meta">
                    <i className={`fa fa-${getAccountIconName(latestEmail.account)}`}></i>
                    &nbsp;{latestEmail.account_name}

                    <span className="extra-meta">
                        &nbsp;/&nbsp;
                        <i className="fa fa-envelope-o"></i> {thread.length}
                        &nbsp;/&nbsp;
                        <i className="fa fa-user-o"></i> {uniqueAddresses.length}
                        {this.renderAttachmentCount()}
                    </span>

                    <span className="buttons">
                        {this.renderStarButton()}
                        {this.renderArchiveButton()}
                        {this.renderRestoreButton()}
                        {this.renderTrashButton()}
                    </span>
                </div>
            </div>
        );
    }
}
