import _ from 'lodash';
import React from 'react';
import { PropTypes } from 'prop-types';
import { DropTarget } from 'react-dnd';

import EmailColumnHeader from 'components/emails/EmailColumnHeader.jsx';
import EmailColumnThread from 'components/emails/EmailColumnThread.jsx';

import filterStore from 'stores/filters.js';
import settingsStore from 'stores/settings.js';
import { getEmailStore } from 'stores/emailStoreProxy.js';
import { subscribe } from 'stores/base.jsx';
import { getColumnStore, getColumnMetaStore } from 'stores/columns.js';

import { moveOrCopyThread } from 'util/threads.js';


const columnTarget = {
    canDrop(props, monitor) {
        const { oldColumn } = monitor.getItem();
        return oldColumn !== props.id;
    },

    drop(props, monitor) {
        moveOrCopyThread(monitor.getItem(), props.id);
    },
};


function collect(connect, monitor) {
    return {
        connectDropTarget: connect.dropTarget(),
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
    };
}


export default class EmailColumnWrapper extends React.Component {
    static propTypes = {
        id: PropTypes.string.isRequired,
    }

    getDecoratedComponentInstance() {
        return this.wrappedEmailColumn
            .wrappedComponent
            .getDecoratedComponentInstance();
    }

    render() {
        // Connect the EmailColumn to the store by passing in the path of the
        // folder we want to listen for changes on.
        const WrappedEmailColumn = subscribe(
            getColumnStore(this.props.id),
            [filterStore, ['accountName']],
            [settingsStore, ['columns', 'systemSettings']],
        )(EmailColumn);

        return <WrappedEmailColumn
            {...this.props}
            {...this.state}
            // Make the original component accessible
            ref={ref => this.wrappedEmailColumn = ref}
        />;
    }
}


@DropTarget('email', columnTarget, collect)
class EmailColumn extends React.Component {
    static propTypes = {
        id: PropTypes.string.isRequired,
        threads: PropTypes.array,
        incomingThreads: PropTypes.array.isRequired,
        hiddenThreadHashes: PropTypes.object.isRequired,
        accountName: PropTypes.string,
        isMainColumn: PropTypes.bool.isRequired,
        systemSettings: PropTypes.object.isRequired,
        columns: PropTypes.array.isRequired,

        isOver: PropTypes.bool.isRequired,
        canDrop: PropTypes.bool.isRequired,
        connectDropTarget: PropTypes.func.isRequired,

        // Surrounding columns
        getPreviousColumn: PropTypes.func.isRequired,
        getNextColumn: PropTypes.func.isRequired,
    }

    componentDidUpdate(prevProps) {
        if (this.props.canDrop && !prevProps.isOver && this.props.isOver) {
            this.containerDiv.classList.add('hover');
        } else {
            this.containerDiv.classList.remove('hover');
        }
    }

    getNewEmails = () => {
        // Check if we're already syncing - note we don't subscribe the whole
        // column to the meta store to avoid unnecessary renders.
        const columnMetaStore = getColumnMetaStore(this.props.id);
        if (columnMetaStore.props.isSyncing) {
            console.debug(`Not syncing ${this.props.id} as we are already syncing!`);
            return;
        }

        getEmailStore().syncFolderEmails(this.props.id);
    }

    getColumnContainer = () => {
        return this.containerDiv;
    }

    renderEmailThreads(threads) {
        if (!threads) {
            return <div className="loader">
                <i className="fa fa-spin fa-refresh"></i>
            </div>;
        }

        // Build a list of our threads and references to each, such that each
        // thread can access the previous/next threads (keyboard shortcuts).
        const threadRefs = [];

        const getThread = (id) => {
            const thread = threadRefs[id];

            if (thread) {
                // Thread is a wrapped by react-dnd, so get the underlying
                // EmailColumnThread instance!
                return thread.getDecoratedComponentInstance();
            }
        }

        const threadElements = _.map(threads, (thread, i) => {
            const getPreviousThread = () => getThread(i - 1);
            const getNextThread = () => getThread(i + 1);

            const isLastThread = i+1 == threads.length;

            return <EmailColumnThread
                key={thread.hash}
                thread={thread}
                threadRef={i}
                column={this}
                columnId={this.props.id}
                isLastThread={isLastThread}

                // Surrounding columns
                getColumnContainer={this.getColumnContainer}
                getPreviousColumn={this.props.getPreviousColumn}
                getNextColumn={this.props.getNextColumn}

                // Surrounding threads
                getPreviousThread={getPreviousThread}
                getNextThread={getNextThread}
                ref={ref => threadRefs[i] = ref}
            />;
        });

        // Attach the refs to the column instance for keyboard controls
        this.threadRefs = threadRefs;

        return threadElements;
    }

    getFilteredEmailThreads() {
        if (!this.props.threads) {
            return this.props.threads;
        }

        const columnStore = getColumnStore(this.props.id);
        const filteredThreads = _.filter(
            this.props.threads,
            thread => {
                const accountKey = thread[0].account_name;

                // If this thread isn't in the selected account, ignore
                if (
                    this.props.accountName
                    && accountKey !== this.props.accountName
                ) {
                    return false;
                }

                // If we're the main column and this thread is being shown in
                // another column, ignore.
                if (this.props.isMainColumn && _.some(
                    thread.allFolderNames,
                    folderName => (
                        _.includes(this.props.columns, folderName)
                    ),
                )) {
                    return false;
                }

                // If this email has been hidden (ie, is/will be moving elsewhere)
                if (columnStore.hasHiddenThread(thread)) {
                    return false;
                }

                return true;
            }
        );

        // Sort by the *first/latest* email in each thread
        return _.orderBy(
            this.props.incomingThreads.concat(filteredThreads),
            thread => new Date(thread[0].date),
            'desc',
        );
    }

    handleScroll = () => {
        if (!this.emailsContainer) {
            return;
        }

        const columnMetaStore = getColumnMetaStore(this.props.id);
        if (columnMetaStore.props.isLoading) {
            console.debug(`Not loading more ${this.props.id} as we are already loading!`);
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = this.emailsContainer;

        if (scrollTop + clientHeight >= scrollHeight) {
            getEmailStore().getFolderEmails(
                this.props.id,
                {query: {
                    batch_size: this.props.systemSettings.batch_size,
                }},
            );
        }
    }

    render() {
        const { connectDropTarget } = this.props;
        const threads = this.getFilteredEmailThreads();

        return connectDropTarget(
            <div
                className="column"
                ref={(div) => {this.containerDiv = div;}}
            >
                <EmailColumnHeader
                    id={this.props.id}
                    isMainColumn={this.props.isMainColumn}
                    getNewEmails={this.getNewEmails}
                />

                <div
                    className="emails"
                    onScroll={_.throttle(this.handleScroll, 1000)}
                    ref={ref => this.emailsContainer = ref}
                >
                    {this.renderEmailThreads(threads)}
                </div>
            </div>
        );
    }
}
