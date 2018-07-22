import _ from 'lodash';
import React from 'react';
import { PropTypes } from 'prop-types';
import { DropTarget } from 'react-dnd';

import { ALIAS_FOLDERS } from 'constants.js';

import EmailColumnThread from 'components/EmailColumnThread.jsx';

import { getEmailStore } from 'stores/emailStoreProxy.js';
import filterStore from 'stores/filters.js';
import settingsStore from 'stores/settings.js';
import { subscribe } from 'stores/base.jsx';
import { getColumnStore } from 'stores/columns.js';

import { capitalizeFirstLetter } from 'util/string.js';

const CHECK_NEW_EMAIL_INTERVAL = 60000;


const columnTarget = {
    drop(props, monitor) {
        const { messageUids, oldColumn, accountName } = monitor.getItem();
        const emailStore = getEmailStore();

        emailStore.moveEmails(
            accountName,
            messageUids,
            oldColumn,
            props.id,

        // Load any new emails for the new column (including the ones we
        // just copied over, as they always appear sequentially). This also
        // triggers the processEmailChanges function. We force this because
        // we might have moved stuff into a folder where it already existed.
        ).then(() => emailStore.syncFolderEmails(
            props.id,
            {
                forceProcess: true,
                accountName: accountName,
                // Tell the backend to expect X messages (and infer if needed!)
                query: {expected_uids: messageUids.length},
            },
        ));
    }
};


function collect(connect, monitor) {
    return {
        connectDropTarget: connect.dropTarget(),
        isOver: monitor.isOver(),
    };
}


export default class EmailColumnWrapper extends React.Component {
    static propTypes = {
        id: PropTypes.string.isRequired,
        mainColumn: PropTypes.bool,
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
            getColumnStore(this.props.id, this.props.mainColumn),
            filterStore,
            settingsStore,
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
        connectDropTarget: PropTypes.func.isRequired,
        counts: PropTypes.object.isRequired,
        threads: PropTypes.array,
        accountName: PropTypes.string,
        mainColumn: PropTypes.string,
        isMainColumn: PropTypes.bool,
        systemSettings: PropTypes.object.isRequired,

        // Surrounding columns
        getPreviousColumn: PropTypes.func.isRequired,
        getNextColumn: PropTypes.func.isRequired,
    }

    componentDidMount() {
        // If no threads, we've no state for this
        if (!this.props.threads) {
            const { initial_batches, batch_size } = this.props.systemSettings;

            getEmailStore().getFolderEmails(
                this.props.id,
                {query: {
                    reset: true,
                    batch_size: batch_size * initial_batches,
                }},
            );

            // Kick off new email checking at the interval
            this.newEmailCheck = setTimeout(
                this.getNewEmails,
                CHECK_NEW_EMAIL_INTERVAL,
            );

        // We have threads, so immeditely check for new emails
        } else {
            this.getNewEmails();
        }
    }

    componentWillUnmount() {
        // Remove any pending email check
        clearTimeout(this.newEmailCheck);
    }

    getNewEmails = () => {
        getEmailStore().syncFolderEmails(this.props.id).then(() => {
            this.newEmailCheck = setTimeout(
                this.getNewEmails,
                CHECK_NEW_EMAIL_INTERVAL,
            );
        });
    }

    getColumnContainer = () => {
        return this.containerDiv;
    }

    renderName() {
        const column = this.props.id;

        // If we're an alias folder - capitalize it
        return (
            _.includes(ALIAS_FOLDERS, column) ?
            capitalizeFirstLetter(column) : column
        );
    }

    renderEmailThreads(threads) {
        if (!threads) {
            return <div className="loader">
                <img src="http://localhost:4421/loader.gif" />
            </div>;
        }

        // Build a list of our threads and references to each, such that each
        // thread can access the previous/next threads (keyboard shortcuts).
        const threadElements = [];
        const threadRefs = [];

        const getThread = (id) => {
            const thread = threadRefs[id];

            if (thread) {
                // Thread is a wrapped by react-dnd, so get the underlying
                // EmailColumnThread instance!
                return thread.getDecoratedComponentInstance();
            }
        }

        _.each(threads, (thread, i) => {
            const getPreviousThread = () => getThread(i - 1);
            const getNextThread = () => getThread(i + 1);

            threadElements.push(<EmailColumnThread
                key={thread.hash}
                thread={thread}
                threadRef={i}
                columnId={this.props.id}

                // Surrounding columns
                getColumnContainer={this.getColumnContainer}
                getPreviousColumn={this.props.getPreviousColumn}
                getNextColumn={this.props.getNextColumn}

                // Surrounding threads
                getPreviousThread={getPreviousThread}
                getNextThread={getNextThread}
                ref={ref => threadRefs[i] = ref}
            />);
        });

        // Attach the refs to the column instance for keyboard controls
        this.threadRefs = threadRefs;

        // Now return our elements, injecting a <hr> between each
        return _.reduce(threadElements, (memo, thread, i) => {
            memo.push(thread);

            if (i < threads.length - 1) {
                memo.push(<hr key={`hr-${thread.key}`} />);
            }

            return memo;
        }, []);
    }

    renderMeta(threads) {
        if (!threads) {
            return;
        }

        const totalAccounts = _.size(this.props.counts);

        // const totalEmails = _.sum(_.map(threads, thread => thread.length));
        const totalEmails = _.reduce(this.props.counts, (memo, value) => {
            memo += value;
            return memo;
        }, 0);

        return `${totalEmails} emails in ${totalAccounts} accounts`;
    }

    getFilteredEmailThreads() {
        return _.filter(
            this.props.threads,
            thread => {
                // If this thread isn't in the selected account, ignore
                if (
                    this.props.accountName
                    && thread[0].account_name !== this.props.accountName
                ) {
                    return false;
                }

                // Always show main column emails (unless filtered by account)
                if (this.props.isMainColumn) {
                    return true;
                }

                // If this thread is only in this folder and the main column
                // is archive, show it. This is because the email is probably
                // in the archive folder, but not in the first `batch_size`.
                // Showing the email when archive is selected is a reasonable
                // default (assume archived).
                if (
                    thread.allFolderNames.length === 1
                    && this.props.mainColumn === 'archive'
                ) {
                    return true;
                }

                // If this thread isn't in the selected mainColumn, ignore
                if (!_.includes(
                    thread.allFolderNames, this.props.mainColumn,
                )) {
                    return false;
                }

                return true;
            }
        );

    }

    render() {
        const { connectDropTarget } = this.props;
        const threads = this.getFilteredEmailThreads();

        return connectDropTarget(
            <div
                className="column"
                ref={(div) => {this.containerDiv = div;}}
            >
                <h3>
                    {this.renderName()}

                    <span className="meta">
                        {this.renderMeta(threads)}
                    </span>
                </h3>

                <div className="emails">
                    {this.renderEmailThreads(threads)}
                </div>
            </div>
        );
    }
}
