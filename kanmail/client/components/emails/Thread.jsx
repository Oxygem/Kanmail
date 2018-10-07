import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import ThreadMessage from 'components/emails/ThreadMessage.jsx';

import threadStore from 'stores/thread.js';
import { subscribe } from 'stores/base.jsx';

const DEFAULT_MESSAGES_TO_SHOW = 3;


class Thread extends React.Component {
    static propTypes = {
        messages: PropTypes.array,
        containerWidth: PropTypes.number,
        containerLeft: PropTypes.number,
    }

    constructor(props) {
        super(props);

        this.state = {
            showAllMessages: false,
        }
    }

    handleOverlayClick() {
        threadStore.close();
    }

    showAllMessages = () => {
        this.setState({
            showAllMessages: true,
        });
    }

    getContainerStyles() {
        return {
            width: this.props.containerWidth,
            left: this.props.containerLeft,
        }
    }

    renderTitle() {
        const { messages } = this.props;

        if (messages.length === 0) {
            return;
        }

        const latestMessage = messages[messages.length -1];

        return <h1>{latestMessage.subject}</h1>;
    }

    renderContent() {
        const { messages } = this.props;

        if (messages.length === 0) {
            return <div className="loader">
                <i className="fa fa-spin fa-refresh"></i>
            </div>;
        }

        let showMoreMessagesLinks;
        let messagesToRender = messages;

        if (
            !this.state.showAllMessages
            && messages.length > DEFAULT_MESSAGES_TO_SHOW
        ) {
            showMoreMessagesLinks = <a
                className="show-all-messages"
                onClick={this.showAllMessages}
            >Show {messages.length - DEFAULT_MESSAGES_TO_SHOW} more messages</a>;
            messagesToRender = _.slice(messages, -DEFAULT_MESSAGES_TO_SHOW);
        }

        const renderedMessages = _.map(messagesToRender, (message, i) => {
            return <ThreadMessage
                key={message.message_id}
                message={message}
                open={(i + 1) === messagesToRender.length}
            />;
        });

        return (
            <div>
                {showMoreMessagesLinks}
                {renderedMessages}
            </div>
        );
    }

    render() {
        return (
            <section id="thread" style={this.getContainerStyles()}>
                {this.renderTitle()}
                <section id="content">
                    {this.renderContent()}
                </section>
            </section>
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
