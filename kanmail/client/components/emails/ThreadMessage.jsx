import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';

import requestStore from 'stores/request.js';

import { cleanHtml } from 'util/html.js';
import { get, post } from 'util/requests.js';
import { formatAddress, formatDate } from 'util/string.js';


class ThreadMessageAttachment extends React.Component {
    static propTypes = {
        partId: PropTypes.string.isRequired,
        part: PropTypes.object.isRequired,
        message: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            downloading: false,
            downloaded: false,
            downloadedFilename: null,
        };
    }

    handleClick = () => {
        const { part, partId } = this.props;
        const { account_name, folder_name, uid } = this.props.message;

        this.setState({
            downloading: true,
            downloaded: false, // reset if re-downloading
        });

        requestStore.get(
            `Fetch message part in ${account_name}/${folder_name}: ${uid}/${partId}`,
            `/api/emails/${account_name}/${folder_name}/${uid}/${partId}/download`,
            {filename: part.name || 'unknown'},
        ).then(data => {
            if (data.saved) {
                this.setState({
                    downloading: false,
                    downloaded: true,
                    downloadedFilename: data.filename,
                });
            } else {
                this.setState({
                    downloading: false,
                    downloaded: false,
                    downloadedFilename: null,
                });
            }
        });
    }

    renderName() {
        const { part } = this.props;
        const name = part.name || 'unknown';

        let nameOrIcon = name;
        let topMeta = `${part.type}/${part.subtype}`;
        let bottomMeta = `${part.size} bytes`;

        if (this.state.downloaded) {
            nameOrIcon = <i className="fa fa-tick"></i>;
            topMeta = 'File saved to';
            bottomMeta = this.state.downloadedFilename;
        } else if (this.state.downloading) {
            nameOrIcon = <i className="fa fa-cog fa-spin"></i>;
            topMeta = 'Downloading...';
        }

        return (
            <div>
                {nameOrIcon}
                <span className="attachment-meta">
                    {topMeta}<br />
                    {bottomMeta}
                </span>
            </div>
        );
    }

    render() {
        return (
            <div
                key={this.props.partId}
                className="attachment-link"
                onClick={this.handleClick}
            >
                {this.renderName()}
            </div>
        );
    }
}


export default class ThreadMessage extends React.Component {
    static propTypes = {
        message: PropTypes.object.isRequired,
        open: PropTypes.bool.isRequired,
    }

    constructor(props) {
        super(props);

        const hasHtml = props.message.body.html ? true : false;

        this.state = {
            open: props.open || props.message.unread,
            replying: false,
            replyingAll: false,

            // No HTML version? Show plain text only and hide show images button
            imagesShown: !hasHtml,
            showPlainText: !hasHtml,
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
                });
            });
        });

        // Replace blockquotes with show/hide buttons
        _.each(doc.querySelectorAll('blockquote'), blockquote => {
            const showButton = document.createElement('button');
            showButton.textContent = 'Show quote';

            showButton.addEventListener('click', (ev) => {
                ev.stopPropagation();
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

        // Replace imgs with show/hide buttons
        _.each(doc.querySelectorAll('img'), img => {
            const imageUrl = img.getAttribute('original-src');
            if (!imageUrl) { // ignore attached images (don't have original-src)
                return;
            }

            const showButton = document.createElement('button');
            showButton.textContent = 'Show image';
            showButton.classList.add('show-image-button');

            showButton.addEventListener('click', (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                img.src = imageUrl;
                showButton.parentNode.removeChild(showButton);
            });

            // Insert the button before the blockquote
            img.parentNode.insertBefore(
                showButton,
                img.nextSibling,
            );
        });

        this.messageElementReady = true;
    }

    handleClickShowImages = () => {
        if (
            !this.state.open  // not open
            || !this.messageElement  // or no target element
        ) {
            return;
        }

        const doc = this.messageElement;
        const showImageButtons = doc.querySelectorAll('button.show-image-button');

        _.each(showImageButtons, button => button.click());

        this.setState({
            imagesShown: true,
        });
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
        });
    }

    handleClickReplyAll = () => {
        post('/open-send', {
            message: this.props.message,
            reply_all: true,
        });
    }

    handleClickForward = () => {
        post('/open-send', {
            message: this.props.message,
            forward: true,
        });
    }

    handleClickText = () => {
        this.messageElementReady = false;
        this.setState({showPlainText: true});
    }

    handleClickHtml = () => {
        this.messageElementReady = false;
        this.setState({
            showPlainText: false,
            imagesShown: false,
        });
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
        if (!this.state.open) {
            return;
        }

        const { message } = this.props;

        const htmlToggle = message.body.html ? (
            <button
                onClick={this.handleClickHtml}
                className={this.state.showPlainText ? '' : 'active'}
            >HTML</button>
        ): null;

        const textToggle = message.body.text ? (<button
                onClick={this.handleClickText}
                className={this.state.showPlainText ? 'active' : ''}
            >Text</button>
        ) : null;

        const imagesToggle = this.state.imagesShown ? null : (
            <button
                onClick={this.handleClickShowImages}
            >Show remote images</button>
        );

        return (
            <div className="extra-meta">
                <span className="right">
                    {htmlToggle}
                    {textToggle}
                    {imagesToggle}

                    <a onClick={this.handleClickForward}>
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

                {this.renderFolders()}
                To: {this.renderAddresses(message.to)}
                {message.cc.length > 0 ? `CC: ${this.renderAddresses(message.cc)}` : ''}
                {message.bcc.length > 0 ? `${message.cc ? <br /> : '' }BCC: ${this.renderAddresses(message.bcc)}` : ''}
            </div>
        );
    }

    renderBody() {
        if (!this.state.open) {
            return;
        }

        const {
            body,
            account_name,
            folder_name,
            uid,
        } = this.props.message;

        let html = body.html || body.text;
        if (this.state.showPlainText) {
            html = body.text;
        }

        const contentIds = body.cid_to_part;
        const doc = cleanHtml(html, true);

        _.each(doc.querySelectorAll('img'), img => {
            if (!_.startsWith(img.src, 'cid:')) {
                return;
            }
            const cid = `<${img.src.slice(4)}>`;
            img.src = `/api/emails/${account_name}/${folder_name}/${uid}/${contentIds[cid]}`;
        });

        return <div
            className="content"
            dangerouslySetInnerHTML={{
                __html: doc.innerHTML,
            }}
            ref={(element) => this.messageElement = element}
        />;
    }

    renderAttachments() {
        if (!this.state.open) {
            return;
        }

        return _.map(this.props.message.parts.attachments, partId => {
            const part = this.props.message.parts[partId];

            return <ThreadMessageAttachment
                key={partId}
                partId={partId}
                part={part}
                message={this.props.message}
            />
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
                {this.renderBody()}
                {this.renderAttachments()}
            </div>
        );
    }
}
