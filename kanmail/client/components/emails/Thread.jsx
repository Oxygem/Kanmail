import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import keyboard from 'keyboard.js';

import Tooltip from 'components/Tooltip.jsx';
import ThreadMessage from 'components/emails/ThreadMessage.jsx';

import threadStore from 'stores/thread.js';
import { subscribe } from 'stores/base.jsx';

import { openReplyToMessageWindow } from 'util/message.js';


class Thread extends React.Component {
    static propTypes = {
        thread: PropTypes.array.isRequired,
        messages: PropTypes.array.isRequired,
        fetching: PropTypes.bool.isRequired,
        fetchingFailed: PropTypes.bool.isRequired,
        // References to surrounding threads
        nextThread: PropTypes.array,
        previousThread: PropTypes.array,
        nextColumnThread: PropTypes.array,
        previousColumnThread: PropTypes.array,
        // Used to position the thread according to the width of the left column
        columnWidth: PropTypes.number.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            showAllMessages: false,
        }
    }

    handleClickClose() {
        threadStore.close();
    }

    handleClickReply = () => {
        const latestMessage = this.getLatestMessage();
        openReplyToMessageWindow(latestMessage);
    }

    handleClickReplyAll = () => {
        const latestMessage = this.getLatestMessage();
        openReplyToMessageWindow(latestMessage, {reply_all: true});
    }

    getLatestMessage() {
        return this.props.messages[this.props.messages.length - 1];
    }

    showAllMessages = () => {
        this.setState({
            showAllMessages: true,
        });
    }

    renderTitle() {
        const { thread } = this.props;
        const latestEmail = thread[0];

        const uniqueSubjects = _.uniq(_.map(thread, message => message.subject));
        const subject = thread.mergedThreads ? uniqueSubjects.join(', ') : latestEmail.subject;

        return <h1>
            {thread.mergedThreads && <Tooltip text={`${thread.mergedThreads} merged threads`}><span className="multi-subject tooltip-wrapper">
                    x{thread.mergedThreads}
                </span>
            </Tooltip>}
            {subject}
        </h1>;
    }

    renderContent() {
        const { messages, fetching, fetchingFailed } = this.props;

        if (fetching) {
            return <div className="loader">
                <i className="fa fa-spin fa-refresh"></i>
            </div>;
        }

        if (fetchingFailed) {
            return <p>Failed to fetch thread messages!</p>;
        }

        let seenUnread = false;

        return _.map(messages, (message, i) => {
            const isLast = (i + 1) === messages.length;

            let scrollTo = false;
            if (!seenUnread && (message.unread || isLast)) {
                seenUnread = true;
                scrollTo = true;
            }

            return <ThreadMessage
                key={message.message_id}
                message={message}
                open={isLast}
                scrollToOnLoad={scrollTo}
            />;
        });
    }

    renderOtherThreadButtons() {
        const buttons = [];

        if (this.props.previousColumnThread) {
            buttons.push(<button
                key="previous-column"
                className="previous-column"
                onClick={keyboard.selectPreviousColumnThread}
            >
                <i className="fa fa-arrow-left" /> Previous column
                <span>{_.truncate(this.props.previousColumnThread[0].subject, {length: 32})}</span>
            </button>);
        }

        if (this.props.nextColumnThread) {
            buttons.push(<button
                key="next-column"
                className="next-column"
                onClick={keyboard.selectNextColumnThread}
            >
                <i className="fa fa-arrow-right" /> Next column
                <span>{_.truncate(this.props.nextColumnThread[0].subject, {length: 32})}</span>
            </button>);
        }

        if (this.props.previousThread) {
            buttons.push(<button
                key="previous-thread"
                className="previous-thread"
                onClick={keyboard.selectPreviousThread}
            >
                <i className="fa fa-arrow-up" /> Previous thread
                <span>{_.truncate(this.props.previousThread[0].subject, {length: 32})}</span>
            </button>);
        }

        if (this.props.nextThread) {
            buttons.push(<button
                key="next-thread"
                className="next-thread"
                onClick={keyboard.selectNextThread}
            >
                <i className="fa fa-arrow-down" /> Next thread
                <span>{_.truncate(this.props.nextThread[0].subject, {length: 32})}</span>
            </button>);
        }

        return <div id="other-buttons">{buttons}</div>;
    }

    renderReplyButtons() {
        if (this.props.messages.length <= 0) {
            return null;
        }

        return [
            <button key="reply" className="reply" onClick={this.handleClickReply}>
                <i className="fa fa-reply" /> Reply
            </button>,
            <button key="reply-all" className="reply-all" onClick={this.handleClickReplyAll}>
                <i className="fa fa-reply-all" /> Reply All
            </button>
        ];
    }

    render() {
        return (
            <div>
                <section id="thread-background" onClick={this.handleClickClose}></section>
                <section
                    id="thread"
                    onClick={(ev) => ev.stopPropagation()}
                    style={{marginLeft: this.props.columnWidth - 1}}
                >
                    {this.renderTitle()}
                    <section id="content">
                        {this.renderContent()}
                    </section>
                    <section id="meta">
                        <button id="close" onClick={this.handleClickClose}>
                            <i className="fa fa-times" /> Close
                        </button>
                        {this.renderOtherThreadButtons()}
                        <div id="respond-buttons">
                            <button className="archive" onClick={keyboard.archiveCurrentThread}>
                                <i className="fa fa-archive" /> Archive
                            </button>
                            <button className="trash" onClick={keyboard.trashCurrentThread}>
                                <i className="fa fa-trash" /> Trash
                            </button>
                            {this.renderReplyButtons()}
                        </div>
                    </section>
                </section>
            </div>
        );
    }
}


// Wrap Thread and re-generate it when the messages we're showing change/vanish
@subscribe(threadStore)
export default class ThreadWrapper extends React.Component {
    static propTypes = {
        messages: PropTypes.array,
    }

    render() {
        if (!this.props.messages) {
            return null;
        }

        return <Thread {...this.props} />;
    }
}
