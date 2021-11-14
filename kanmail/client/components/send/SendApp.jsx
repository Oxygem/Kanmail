import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import Select, { AsyncCreatable } from 'react-select';

import Editor from 'components/Editor.jsx';
import Tooltip from 'components/Tooltip.jsx';
import ControlInput from 'components/emails/ControlInput.jsx';

import settingsStore from 'stores/settings.js'
import { subscribe } from 'stores/base.jsx'

import { closeWindow, makeDragElement, makeNoDragElement } from 'window.js';

import { cleanHtml, documentFromHtml, popElementFromDocument } from 'util/html.js'
import { post } from 'util/requests.js'
import { stopEventPropagation } from 'util/element.js';


const KANMAIL_SIGNATURE_BEGIN = 'KANMAIL_SIGNATURE_BEGIN';
const KANMAIL_QUOTE_BEGIN = 'KANMAIL_QUOTE_BEGIN';


function makeContactLabel(contactTuple) {
    if (!contactTuple[0]) {
        return contactTuple[1];
    }

    if (contactTuple[0] == contactTuple[1]) {
        return contactTuple[0];
    }

    return `${contactTuple[0]} (${contactTuple[1]})`;
}

function makeAccountContactOption(accountName, contactTuple) {
    const name = contactTuple[0]
    const email = contactTuple[1];

    let label = `${name} (${email})`;
    if (name == email) {
        label = email;
    }

    return {
        value: [accountName, name, email],
        label: label,
    };
}

function prependIfNotPresent(prependTo, prependString) {
    if (
        prependTo.startsWith(prependString)
        || prependTo.startsWith(prependString.toLowerCase())
        || prependTo.startsWith(prependString.toUpperCase())
    ) {
        return prependTo;
    }
    return `${prependString}: ${prependTo}`;
}

function getFilename(path) {
    const bits = path.split('/');
    return bits[bits.length - 1];
}


@subscribe(settingsStore)
export default class SendApp extends React.Component {
    static propTypes = {
        accounts: PropTypes.array.isRequired,
        contacts: PropTypes.array.isRequired,
        signatures: PropTypes.array.isRequired,
        message: PropTypes.object,
    }

    constructor(props) {
        super(props);

        let defaultAccount;
        const firstAccountName  = props.accounts[0].name;
        const firstAccountContacts = this.props.accounts[0].contacts;

        if (firstAccountContacts && firstAccountContacts.length > 0) {
            defaultAccount = makeAccountContactOption(
                firstAccountName, firstAccountContacts[0],
            );
        } else {
            defaultAccount = this.getDefaultAccount(0);
        }

        this.state = {
            includeQuote: false,
            accountContact: defaultAccount,

            to: [],
            cc: [],
            bcc: [],

            subject: '',
            messageHtml: '',
            messageText: '',

            attachments: [],
            attachmentData: {},

            // "Hidden"/uneditable fields
            replyToMessageId: null,
            replyToMessageReferences: null,
            replyToQuoteHtml: null,

            selectedSignatureIdx: -1,
            signatureHtml: null,
            signatureText: null,
        }

        if (props.message) {
            // Figure out subject
            let subject = props.message.subject;
            if (props.message.forward) {
                subject = prependIfNotPresent(subject, 'Fwd');
            } else if (props.message.reply || props.message.reply_all) {
                subject = prependIfNotPresent(subject, 'Re')
            }
            this.state.subject = subject;

            // Figure out account contact we're sending from
            let accountContact;
            const accountIndex = _.findIndex(
                this.props.accounts,
                account => account.name === props.message.account_name,
            );
            const account = props.accounts[accountIndex];
            const accountContacts = account.contacts;
            if (accountContacts && accountContacts.length > 0) {
                accountContact = makeAccountContactOption(
                    account.name, accountContacts[0],
                );
            } else {
                accountContact = this.getDefaultAccount(accountIndex);
            }
            this.state.accountContact = accountContact;

            // Figure out who we're emailing
            if (props.message.reply_all || props.message.edit) {
                const allTos = props.message.to.concat(props.message.reply_to);
                this.state.to = _.map(allTos, contactTuple => ({
                    value: contactTuple[1],
                    label: makeContactLabel(contactTuple),
                }));
                this.state.cc = _.map(props.message.cc, contactTuple => ({
                    value: contactTuple[1],
                    label: makeContactLabel(contactTuple),
                }));
                this.state.bcc = _.map(props.message.bcc, contactTuple => ({
                    value: contactTuple[1],
                    label: makeContactLabel(contactTuple),
                }));
            // Default: simple reply message
            } else {
                this.state.to = _.map(props.message.reply_to, contactTuple => {
                    return {
                        value: contactTuple[1],
                        label: makeContactLabel(contactTuple),
                    };
                });
            }

            // Figure out where to put the actual message (edit or reply/forward)
            if (props.message.edit) {
                const doc = documentFromHtml(props.message.body.html);
                const quote = popElementFromDocument(doc, 'blockquote#kanmail-quote');
                const signature = popElementFromDocument(doc, 'div#kanmail-signature');
                this.state.messageHtml = doc.body.innerHTML;
                this.state.replyToQuoteHtml = quote.innerHTML;
                this.state.signatureHtml = signature.innerHTML;
                this.state.includeQuote = true;
                // Copy the reply to message ID as this was already set on save
                this.state.replyToMessageId = props.message.in_reply_to;
                this.state.replyToMessageReferences = props.message.originalReferences;

                const messageText = [];
                const signatureText = [];
                const quoteText = [];
                const lines = props.message.body.text.split(/\r?\n/);
                let target = messageText;
                _.each(lines, line => {
                    if (line === KANMAIL_SIGNATURE_BEGIN) {
                        target = signatureText;
                        return;
                    } else if (line === KANMAIL_QUOTE_BEGIN) {
                        target = quoteText;
                        return;
                    }
                    target.push(line);
                });

                this.state.messageText = messageText;
                this.state.replyToQuoteText = quoteText;
                this.state.signatureText = signatureText;
            } else {
                this.state.includeQuote = true;
                this.state.replyToMessageId = props.message.message_id;
                this.state.replyToMessageReferences = props.message.originalReferences;
                this.state.replyToQuoteHtml = props.message.body.html;
                this.state.replyToQuoteText = props.message.body.text;
            }
        }
    }

    getDefaultAccount = (accountIndex) => {
        const account = this.props.accounts[accountIndex];
        const smtpUsername = account.smtp_connection.username;
        return makeAccountContactOption(
            account.name,
            [smtpUsername, smtpUsername],
        );
    }

    getEmailData(isDraft=false) {
        const emailData = _.pick(this.state, [
            'subject',
            'attachments',
        ]);

        // Attach any binary attachment data
        emailData.attachment_data = this.state.attachmentData;

        // Attach the HTML + plaintext copy
        emailData.html = this.editor.getHtml();
        emailData.text = this.editor.getText();

        _.each(['to', 'cc', 'bcc'], key => {
            const value = this.state[key];
            if (!value) {
                return;
            }
            emailData[key] = _.map(value, item => item.value);
        });

        const accountTuple = this.state.accountContact.value;
        emailData.from = [accountTuple[1], accountTuple[2]];

        // Add any signature data
        if (this.state.selectedSignatureIdx > -1) {
            const signatureHtml = this.props.signatures[this.state.selectedSignatureIdx].html;
            const signatureText = this.props.signatures[this.state.selectedSignatureIdx].text;

            if (isDraft) {
                emailData.html += `<div id="kanmail-signature">${signatureHtml}</div>`;
                emailData.text += `\n${KANMAIL_SIGNATURE_BEGIN}\n${signatureText}`;
            } else {
                emailData.html += signatureHtml;
                emailData.text += `\n${signatureText}`;
            }
        }

        // Add any reply data
        emailData.reply_to_message_id = this.state.replyToMessageId;
        emailData.reply_to_message_references = this.state.replyToMessageReferences;

        if (this.state.includeQuote) {
            if (this.state.replyToQuoteHtml) {
                emailData.html += isDraft ?
                    `<blockquote id="kanmail-quote">${this.state.replyToQuoteHtml}</blockquote>` :
                    `<blockquote>${this.state.replyToQuoteHtml}</blockquote>`;
            }
            if (this.state.replyToQuoteText) {
                emailData.text += isDraft ?
                    `\n\n${KANMAIL_QUOTE_BEGIN}\n${this.state.replyToQuoteText}` :
                    `\n\n---\n${this.state.replyToQuoteText}`;
            }
        }

        return [accountTuple[0], emailData];
    }

    handleInputChange = (field, ev) => {
        this.setState({
            [field]: ev.target.value,
        })
    }

    handleIncludeQuoteChange = () => {
        this.setState({
            includeQuote: !this.state.includeQuote,
        })
    }

    handleSendEmail = (ev) => {
        ev.preventDefault();

        if (this.state.isSending) {
            if (this.state.saveError) {
                this.setState({isSending: false, saveError: null});
            }
            return;
        }

        this.setState({isSending: true});

        const [accountKey, emailData] = this.getEmailData();

        post(`/api/emails/${accountKey}`, emailData)
            .then(() => {
                closeWindow();
                this.setState({isSent: true});
            })
            .catch((err) => this.setState({saveError: err}));
    }

    handleSaveEmail = (ev) => {
        ev.preventDefault();

        if (this.state.isSending) {
            if (this.state.saveError) {
                this.setState({isSending: false, saveError: null});
            }
            return;
        }

        this.setState({isSending: true});

        const [accountKey, emailData] = this.getEmailData(true);

        post(`/api/emails/${accountKey}/drafts`, emailData)
            .then(() => {
                closeWindow();
                this.setState({isSent: true});
            })
            .catch((err) => this.setState({saveError: err}));
    }

    handleSelectChange = (field, item) => {
        this.setState({
            [field]: item,
        })
    }

    handleClickAttach = (ev) => {
        ev.preventDefault();

        // Browsers cannot get full path + filename due to security restrictions,
        // so we actually read the files into memory and then write them to the
        // server in the API request. This is not ideal, but there's alternative!
        const fileSelector = document.createElement('input');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('multiple', 'multiple');
        fileSelector.addEventListener('change', ev => {
            _.each(ev.target.files, file => {
                const reader = new FileReader();
                reader.onload = () => {
                    const allFilenames = this.state.attachments.concat([file.name]);
                    const allAttachmentData = this.state.attachmentData;
                    // Save the data base64 encoded
                    allAttachmentData[file.name] = btoa(reader.result);
                    this.setState({
                        attachments: allFilenames,
                        attachmentData: allAttachmentData,
                    });
                }
                reader.readAsBinaryString(file);
            });
        });

        fileSelector.click();
    }

    handleSelectSignature = (ev) => {
        this.setState({selectedSignatureIdx: ev.value});
    }

    renderQuote() {
        if (!this.props.message) {
            return;
        }

        let blockquote = null;
        if (this.state.includeQuote) {
            blockquote = <blockquote
                id="reply-quote"
                dangerouslySetInnerHTML={{
                    __html: cleanHtml(this.state.replyToQuoteHtml),
                }}
            />;
        }

        return (
            <div>
                <div
                    id="include-quote"
                    className={this.state.sending ? 'sending': ''}
                >
                    <input
                        id="include_quote"
                        type="checkbox"
                        checked={this.state.includeQuote}
                        onChange={this.handleIncludeQuoteChange}
                    />
                    <label htmlFor="include_quote">Include quote?</label>
                </div>

                {blockquote}
            </div>
        );
    }

    renderAddressBookSelect(contactOptions, dataKey) {
        function delayedOptionLoad(inputValue) {
            let filteredOptions = [];

            if (inputValue.length > 2) {
                inputValue = inputValue.toLowerCase();

                filteredOptions = _.filter(
                    contactOptions,
                    option => option.lowercaseLabel.includes(inputValue),
                );

                if (filteredOptions.length > 100) {
                    filteredOptions = filteredOptions.slice(0, 100);
                }
            }

            return new Promise(resolve => {
                setTimeout(() => resolve(filteredOptions), 0);
            });
        }

        return <AsyncCreatable
            isMulti
            defaultOptions
            cacheOptions
            loadOptions={delayedOptionLoad}
            id={dataKey}
            classNamePrefix="react-select"
            options={contactOptions}
            value={this.state[dataKey]}
            onChange={_.partial(
                this.handleSelectChange, dataKey,
            )}
        />;
    }

    renderSendButton() {
        let text = <span><i className="fa fa-paper-plane" /> Send email</span>;
        const classes = ['send'];

        if (this.state.isSending) {
            if (this.state.saveError) {
                text = `Error sending email: ${this.state.saveError.data.errorMessage}`;
                classes.push('error');
            } else if (this.state.isSent) {
                text = 'Email sent, please close this window';
                classes.push('disabled');
            } else {
                text = <span><i className="fa fa-spin fa-refresh" /> Sending email</span>;
                classes.push('disabled');
            }
        } else {
            classes.push('submit');
        }

        return (
            <button
                type="submit"
                className={classes.join(' ')}
                onClick={this.handleSendEmail}
                ref={makeNoDragElement}
            >{text}</button>
        );
    }

    renderSaveButton() {
        if (this.state.isSending || this.state.saveError || this.state.isSent) {
            return null;
        }

        const text = <span>Save draft</span>;
        const classes = ['save'];
        return (
            <button
                type="submit"
                className={classes.join(' ')}
                onClick={this.handleSaveEmail}
                ref={makeNoDragElement}
            ><i className="fa fa-save" /> {text}</button>
        );
    }

    renderAttachButton() {
        let buttonText = 'Attach files';
        if (this.state.attachments.length > 0) {
            buttonText = `Attach files (${this.state.attachments.length})`;
        }

        const button = <button
            className="attach"
            onClick={this.handleClickAttach}
            ref={makeNoDragElement}
        ><i className="fa fa-paperclip" /> {buttonText}</button>;

        if (this.state.attachments.length === 0) {
            return button;
        }

        const attachments = _.map(this.state.attachments, attachment => (
            <li key={attachment}>{getFilename(attachment)}</li>
        ));

        return (
            <Tooltip text={attachments} extraTop={16}>{button}</Tooltip>
        );
    }

    renderSignature() {
        let signatureHtml = this.state.signatureHtml;

        if (this.state.selectedSignatureIdx > -1) {
            signatureHtml = this.props.signatures[this.state.selectedSignatureIdx].html;
        }

        if (!signatureHtml) {
            return null;
        }

        return <div dangerouslySetInnerHTML={{__html: signatureHtml}} />;
    }

    render() {
        const accountOptions = _.reduce(
            this.props.accounts,
            (memo, account, accountIndex) => {
                const accountContacts = this.props.accounts[accountIndex].contacts;
                if (accountContacts && accountContacts.length > 0) {
                    return _.concat(memo, _.map(
                        accountContacts,
                        nameEmail => makeAccountContactOption(
                            account.name, nameEmail,
                        ),
                    ));
                }
                memo.push(this.getDefaultAccount(accountIndex));
                return memo;
            },
            [],
        );

        const contactOptions = _.map(this.props.contacts, (contact) => {
            const label = makeContactLabel([contact.name, contact.email]);
            return {
                label,
                value: [contact.name, contact.email],
                lowercaseLabel: label.toLowerCase(),
            };
        });

        const editorClasses = [];

        if (this.state.editorActive) {
            editorClasses.push('active');
        }

        const signatureOptions = _.map(
            this.props.signatures,
            (signature, i) => ({
                value: i,
                label: signature.name,
            }),
        );
        signatureOptions.unshift({value: -1, label: 'Select signature'});

        const signatureSelector = <Select
            className="signature-select"
            classNamePrefix="react-select"
            options={signatureOptions}
            value={signatureOptions[this.state.selectedSignatureIdx + 1]}
            onChange={this.handleSelectSignature}
        />;

        return (
            <section
                id="new-email"
                className={window.KANMAIL_PLATFORM}
                onClick={() => this.editor && this.editor.focus()}
            >
                <ControlInput />

                <header
                    className="new-email flex header-bar"
                    onClick={stopEventPropagation}
                    ref={makeDragElement}
                >
                    <h2>New Email</h2>
                    <div>
                        {this.renderAttachButton()}
                        {this.renderSaveButton()}
                        {this.renderSendButton()}
                    </div>
                </header>

                <form
                    id="send-form"
                    className="flex flex-vertical flex-nowrap"
                    onClick={() => this.editor && this.editor.focus()}
                >
                    <div
                        className="flex form-top"
                        onClick={stopEventPropagation}
                    >
                        <div className="wide">
                            <label htmlFor="to">To</label>
                            {this.renderAddressBookSelect(contactOptions, 'to')}
                        </div>

                        <div className="wide">
                            <label htmlFor="cc">CC</label>
                            {this.renderAddressBookSelect(contactOptions, 'cc')}
                        </div>

                        <div className="wide">
                            <label htmlFor="bcc">BCC</label>
                            {this.renderAddressBookSelect(contactOptions, 'bcc')}
                        </div>

                        <div className="wide">
                            <label htmlFor="account">From</label>
                            <Select
                                id="account"
                                classNamePrefix="react-select"
                                options={accountOptions}
                                value={this.state.accountContact}
                                onChange={_.partial(
                                    this.handleSelectChange, 'accountContact',
                                )}
                            />
                        </div>

                        <div className="wide subject">
                            <input
                                id="subject"
                                type="text"
                                value={this.state.subject}
                                placeholder="Subject"
                                onChange={_.partial(this.handleInputChange, 'subject')}
                            />
                        </div>
                    </div>

                    <div
                        className="flex form-content"
                        onClick={stopEventPropagation}
                    >
                        <div className="wide">
                            <div
                                id="textarea-body"
                                className={editorClasses.join(' ')}
                            >
                                <Editor
                                    initialHtml={this.state.messageHtml}
                                    placeholder="Write something..."
                                    controls={[() => signatureSelector]}
                                    onFocus={() => this.setState({editorActive: true})}
                                    onBlur={() => this.setState({editorActive: false})}
                                    ref={editor => this.editor = editor}
                                />
                            </div>
                        </div>

                        <div className="wide signature">
                            {this.renderSignature()}
                        </div>

                        <div className="wide quote">
                            {this.renderQuote()}
                        </div>
                    </div>
                </form>
            </section>
        );
    }
}
