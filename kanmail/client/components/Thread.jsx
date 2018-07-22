import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import NewEmail from 'components/NewEmail.jsx';
import threadStore from 'stores/thread.js';
import { subscribe } from 'stores/base.jsx';
import { get, post } from 'util/requests.js';
import { formatAddress, formatDate } from 'util/string.js';
import { addMessage } from 'util/messages.js';

const DEFAULT_MESSAGES_TO_SHOW = 3;


class Message extends React.Component {
    static propTypes = {
        message: PropTypes.object.isRequired,
        open: PropTypes.bool.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            open: props.open || props.message.unread,
            replying: false,
            replyingAll: false,
        };
    }

    componentDidUpdate() {
        this.processMessageDOM();
    }

    componentDidMount() {
        this.processMessageDOM();
    }

    processMessageDOM() {
        if (
            !this.state.open  // not open
            || !this.messageElement  // or no target element
            || this.messageElementReady  // or target already prepped
        ) {
            return;
        }

        const doc = this.messageElement;

        // Make all links open in a new tab
        _.each(doc.querySelectorAll('a'), link => {
            // Overwrite the link to tell the server to open the link in the OS
            // external browser.
            const target = link.getAttribute('href');

            // On click fire off a background request to open the link in the
            // OS default browser.
            link.addEventListener('click', ev => {
                ev.preventDefault();
                get('/open-link', {
                    url: target,
                }).catch(() => (
                    addMessage(`Could not open: ${target}`, 'critical')
                ));
            });
        });

        // Replace blockquotes with show/hide buttons
        _.each(doc.querySelectorAll('blockquote'), blockquote => {
            const showButton = document.createElement('button');
            showButton.textContent = 'Show quote';
            showButton.classList.add('quote-toggle');

            showButton.addEventListener('click', (ev) => {
                ev.preventDefault();

                if (blockquote.style.display == 'none') {
                    blockquote.style.display = 'block';
                    showButton.textContent = 'Hide quote';
                } else {
                    blockquote.style.display = 'none';
                    showButton.textContent = 'Show quote';
                }
            });

            // Hide the quote
            blockquote.style.display = 'none';

            // Insert the button before the blockquote
            blockquote.parentNode.insertBefore(
                showButton,
                blockquote.nextSibling,
            );
        });

        this.messageElementReady = true;
    }

    handleClick = () => {
        if (this.state.open) {
            this.setState({
                open: false,
            });

            this.messageElementReady = false;
        } else {
            this.setState({
                open: true,
            });
        }
    }

    handleClickReply = () => {
        post('/open-send', {
            message: this.props.message,
        }).catch(() => (
            addMessage('Failed to open send window!', 'critical')
        ));
    }

    handleClickReplyAll = () => {
        post('/open-send', {
            message: this.props.message,
            reply_all: true,
        }).catch(() => (
            addMessage('Failed to open send window!', 'critical')
        ));
    }

    renderStar() {
        const { message } = this.props;
        const starred = _.includes(message.flags, '\\Flagged');

        if (starred) {
            return <i className="fas fa-star"></i>;
        }
    }

    renderFolders() {
        return _.map(_.keys(this.props.message.folderUids), folderName => (
            <span className="tag" key={folderName}>{folderName}</span>
        ));
    }

    renderAddresses(addresses) {
        return _.map(addresses, formatAddress).join(', ');
    }

    renderExtraMeta() {
        if (this.state.open) {
            const { message } = this.props;

            return (
                <div className="extra-meta">
                    {this.renderFolders()}
                    To: {this.renderAddresses(message.to)}
                    {message.cc.length > 0 ? `CC: ${this.renderAddresses(message.cc)}` : ''}
                    {message.bcc.length > 0 ? `${message.cc ? <br /> : '' }BCC: ${this.renderAddresses(message.bcc)}` : ''}
                    <span className="right">
                        <a>
                            <i className="fa fa-send"></i>
                            Forward
                        </a>
                        <a onClick={this.handleClickReply}>
                            <i className="fa fa-reply"></i>
                            Reply
                        </a>
                        <a onClick={this.handleClickReplyAll}>
                            <i className="fa fa-reply-all"></i>
                            Reply All
                        </a>
                    </span>
                </div>
            );
        }
    }

    renderReply() {
        // Replying? Show the reply form!
        if (!this.state.replying) {
            return null;
        }

        return <NewEmail
            message={this.props.message}
            replyAll={this.state.replyingAll}
        />;
    }

    renderBodyHTML() {
        let html = this.props.message.body;

        // Parse the message into DOM
        const parser = new DOMParser();
        const tempDocument = parser.parseFromString(html, 'text/html');

        // Strip crappy tags
        _.each(tempDocument.body.querySelectorAll(
            'link,meta,style,title,script',
        ), element => {
            element.parentNode.removeChild(element);
        });

        return {
            __html: tempDocument.body.innerHTML,
        };
    }

    renderBody() {
        if (!this.state.open) {
            return;
        }

        return <div
            dangerouslySetInnerHTML={this.renderBodyHTML()}
            ref={(element) => this.messageElement = element}
        />;
    }

    renderAttachments() {
        if (!this.state.open) {
            return;
        }

        return _.map(this.props.message.parts.attachments, partId => {
            const part = this.props.message.parts[partId];

            return (
                <div key={partId} className="attachment-link">
                    {part.name}
                    <span className="attachment-meta">
                        {part.type}/{part.subtype}<br />
                        {part.size} bytes
                    </span>
                </div>
            );
        });
    }

    render() {
        const { message } = this.props;

        return (
            <div key={message.message_id} className="message">
                <div className="meta" onClick={this.handleClick}>
                    {this.renderStar()}
                    {this.renderAddresses(message.from)}
                    <span className="right">
                        {formatDate(message.date)}
                    </span>
                </div>
                {this.renderExtraMeta()}
                {this.renderReply()}
                {this.renderBody()}
                {this.renderAttachments()}
            </div>
        );
    }
}


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
                <img src="http://localhost:4421/loader.gif" />
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
            return <Message
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
