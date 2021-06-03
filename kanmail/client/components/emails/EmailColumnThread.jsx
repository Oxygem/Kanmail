import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import { DragSource } from 'react-dnd';

import { ALIAS_FOLDERS } from 'constants.js';

import keyboard from 'keyboard.js';

import Avatar from 'components/Avatar.jsx';
import Tooltip from 'components/Tooltip.jsx';

import controlStore from 'stores/control.js';
import requestStore from 'stores/request.js';
import threadStore from 'stores/thread.js';
import settingsStore from 'stores/settings.js';
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

        const { starred, archived, deleted, isIncoming } = this.props.thread;
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
            locked: isIncoming || false,
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

    undoSetIsMoving = () => {
        this.setState({
            moving: false,
            locked: false,
        });
    }

    isBusy = () => {
        return this.state.locked;
    }

    isDeleteOnTrash() {
        const { account_name } = this.props.thread[0];
        const accountSettings = settingsStore.getAccountSettings(account_name);
        return this.props.columnId === 'trash' || accountSettings.folders.delete_on_trash;
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

        if (this.isBusy() || this.state.hover || threadStore.isOpen || controlStore.props.open) {
            return;
        }

        keyboard.setThreadComponent(this);
    }

    handleMouseLeave = () => {
        if (this.isBusy() || threadStore.isOpen || controlStore.props.open) {
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

    handleClickMove = (ev) => {
        ev.stopPropagation();

        if (this.state.locked) {
            console.debug('Thread locked, not moving!');
        }

        const subject = this.props.thread[0].subject;
        const moveData = getMoveDataFromThreadComponent(this);
        controlStore.open('move', subject, moveData);
    }

    /*
        For every message in this thread, *any folder*, generate a move request
        to another folder.
    */
    handleThreadMessages = (previousState, folderFilter, handler) => {
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
                requests.push(handler({accountKey, uids, folderName}));
            });

            return Promise.all(requests).catch((e) => {
                undoMove({error: true});
                throw e;  // re-throw for the requestStore to capture
            });
        }

        requestStore.addUndoable(moveThread, undoMove);
    }

    moveThreadMessages = (targetFolder, previousState, folderFilter=null) => {
        return this.handleThreadMessages(
            previousState, folderFilter,
            ({accountKey, uids, folderName}) => getEmailStore().moveEmails(
                accountKey, uids, folderName, targetFolder,
            ),
        );
    }

    deleteThreadMessages = (previousState) => {
        return this.handleThreadMessages(
            previousState, null,
            ({accountKey, uids, folderName}) => getEmailStore().deleteEmails(
                accountKey, folderName, uids,
            ),
        );
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
            // Archive messages in the inbox or columns, not sent/trash/spam/drafts
            folderName => folderName == 'inbox' || !_.includes(ALIAS_FOLDERS, folderName),
        );
    }

    handleClickTrash = (ev) => {
        ev.stopPropagation();

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

        if (this.isDeleteOnTrash()) {
            this.deleteThreadMessages(previousState);
            return;
        }

        this.moveThreadMessages(
            'trash', previousState,
            // Anything already in the trash needn't be moved to trash!
            folderName => folderName !== 'trash',
        );
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

        const text = this.state.starred ? 'Unstar' : 'Star';

        return (
            <Tooltip text={<span>{text} (<i className="fa fa-keyboard-o" /> s)</span>}>
                <a
                    onClick={keyboard.starCurrentThread}
                    className={`star ${this.state.starred ? 'active' : ''}`}
                >
                    <i className={classNames.join(' ')} />
                </a>
            </Tooltip>
        );
    }

    renderMoveButton() {
        const classNames = ['fa'];

        if (this.state.moving) {
            classNames.push('fa-cog');
            classNames.push('fa-spin');
        } else {
            classNames.push('fa-folder-open');
        }

        return (
            <Tooltip text={<span>Move (<i className="fa fa-keyboard-o" /> m)</span>}>
                <a onClick={keyboard.startMoveCurrentThread} className="move">
                    <i className={classNames.join(' ')} />
                </a>
            </Tooltip>
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
            <Tooltip text={<span>Archive (<i className="fa fa-keyboard-o" /> enter)</span>}>
                <a onClick={keyboard.archiveCurrentThread} className="archive">
                    <i className={classNames.join(' ')} />
                </a>
            </Tooltip>
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
            <Tooltip text="Restore to inbox">
                <a onClick={this.handleClickRestore} className='archive'>
                    <i className={classNames.join(' ')} />
                </a>
            </Tooltip>
        );
    }

    renderTrashButton() {
        const classNames = ['fa'];

        if (this.state.trashing) {
            classNames.push('fa-cog');
            classNames.push('fa-spin');
        } else {
            classNames.push('fa-trash');
        }

        const text = this.isDeleteOnTrash() ? 'Delete permanently' : 'Trash';

        return (
            <Tooltip text={<span>{text} (<i className="fa fa-keyboard-o" /> backspace)</span>}>
                <a onClick={keyboard.trashCurrentThread} className="trash">
                    <i className={classNames.join(' ')} />
                </a>
            </Tooltip>
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

        return <span><i className="fa fa-paperclip" /> {attachmentCount}</span>;
    }

    renderLabels() {
        const folderNames = _.filter(
            this.props.thread.allFolderNames,
            name => name !== this.props.columnId && name !== 'archive',
        );

        if (folderNames.length === 0) {
            return null;
        }

        return <span className="tag"><i className="fa fa-tag" /> {folderNames.join(', ')}</span>;
    }

    render() {
        const { connectDragSource, thread } = this.props;
        const latestEmail = thread[0];

        // Show the avatar of the most recent external (non local user) email
        const latestEmailNotUs = _.find(
            thread,
            message => !settingsStore.props.accountEmails.has(message.from[0][1]),
        ) || latestEmail;

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

        if (this.props.thread.isIncoming) {
            classNames.push('incoming');
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
                    <Avatar address={latestEmailNotUs.from[0]} />
                    {thread.mergedThreads && <Tooltip text={`${thread.mergedThreads} merged threads`}>
                        <span className="multi-subject tooltip-wrapper">
                            x{thread.mergedThreads}
                        </span>
                    </Tooltip>}
                    <span className="subject">
                        {this.state.deleted ? <strike>{subject}</strike> : subject}
                    </span>
                </h4>
                <p>{latestEmail.excerpt}</p>
                <div className="meta">
                    <i className={`fa fa-${getAccountIconName(latestEmail.account)}`} />
                    &nbsp;{latestEmail.account_name}
                    {this.renderLabels()}

                    <span className="extra-meta">
                        {this.state.starred && <a className="star active"><i className="fa fa-star" /></a>}
                        {thread.length > 1 && <span><i className="fa fa-envelope-o" /> {thread.length}</span>}
                        {uniqueAddresses.length > 1 && <span><i className="fa fa-user-o" /> {uniqueAddresses.length}</span>}
                        {this.renderAttachmentCount()}
                    </span>

                    <span className="buttons">
                        {this.renderStarButton()}
                        {this.renderMoveButton()}
                        {this.renderArchiveButton()}
                        {this.renderRestoreButton()}
                        {this.renderTrashButton()}
                    </span>
                </div>
            </div>
        );
    }
}
