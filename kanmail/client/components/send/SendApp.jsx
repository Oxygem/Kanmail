import 'react-quill/dist/quill.snow.css';

import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import Select, { AsyncCreatable } from 'react-select';
import ReactQuill from 'react-quill';

import HeaderBar from 'components/HeaderBar.jsx';

import settingsStore from 'stores/settings.js'
import { subscribe } from 'stores/base.jsx'

import { closeWindow } from 'window.js';

import { cleanHtml } from 'util/html.js'
import { get, post } from 'util/requests.js'

import Quill from 'quill';

// Use divs > p, see: https://github.com/quilljs/quill/issues/861#issuecomment-239961806
var Block = Quill.import('blots/block');
Block.tagName = 'DIV';
Quill.register(Block, true);


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
            body: '',
            textBody: '',

            attachments: [],

            // "Hidden"/uneditable fields
            replyToMessageId: null,
            replyToMessageReferences: null,
            replyToQuoteHtml: null,
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
            if (props.message.reply) {
                this.state.to = _.map(props.message.reply_to, contactTuple => {
                    return {
                        value: contactTuple[1],
                        label: makeContactLabel(contactTuple),
                    };
                });
            } else if (props.message.reply_all | props.message.edit) {
                this.state.to = _.map(props.message.to, contactTuple => ({
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
            }

            // Figure out where to put the actual message (edit or reply/forward)
            if (props.message.edit) {
                this.state.textBody = props.message.body.text;
                this.state.body = props.message.body.html;
            } else {
                this.state.includeQuote = true;
                this.state.replyToMessageId = props.message.message_id;
                this.state.replyToMessageReferences = props.message.originalReferences;
                this.state.replyToQuoteHtml = props.message.body.html || props.message.body.text;
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

    getEmailData() {
        const emailData = _.pick(this.state, [
            'subject',
            'attachments',
        ]);

        // Attach the HTML + plaintext copy
        emailData.html = this.state.body;
        emailData.text = this.state.textBody;

        _.each(['to', 'cc', 'bcc'], key => {
            const value = this.state[key];
            if (!value) {
                return;
            }
            emailData[key] = _.map(value, item => item.value);
        });

        const accountTuple = this.state.accountContact.value;
        emailData.from = [accountTuple[1], accountTuple[2]];

        return [accountTuple[0], emailData];
    }

    handleInputChange = (field, ev) => {
        this.setState({
            [field]: ev.target.value,
        })
    }

    handleEditorStateChange = (value, delta, source, editor) => {
        this.setState({
            body: value,
            textBody: editor.getText(),
        });
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
        emailData.replyToMessageId = this.state.replyToMessageId;
        emailData.replyToMessageReferences = this.state.replyToMessageReferences;
        emailData.replyToQuoteHtml = this.state.replyToQuoteHtml;

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

        const [accountKey, emailData] = this.getEmailData();

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

        get('/select-files').then(data => {
            const allFilenames = this.state.attachments.concat(data.filenames);
            this.setState({
                attachments: allFilenames,
            });
        });
    }

    renderQuote() {
        if (!this.props.message || this.props.message.edit) {
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
        let text = <span>Send email <i className="fa fa-arrow-right" /></span>;
        const classes = ['send'];

        if (this.state.isSending) {
            if (this.state.saveError) {
                text = `Error sending email: ${this.state.saveError.data.errorMessage}`;
                classes.push('error');
            } else if (this.state.isSent) {
                text = 'Email sent, please close this window';
                classes.push('disabled');
            } else {
                text = <span>Sending email <i className="fa fa-spin fa-refresh" /></span>;
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
            >{text}</button>
        );
    }

    renderAttachButton() {
        let buttonText = 'Attach files';
        if (this.state.attachments.length > 0) {
            buttonText = `Attach files (${this.state.attachments.length})`;
        }

        const attachments = _.map(this.state.attachments, attachment => (
            <li>{getFilename(attachment)}</li>
        ));

        return (
            <button
                className="attach"
                onClick={this.handleClickAttach}
            ><i className="fa fa-attach" />{buttonText}{attachments}</button>
        );
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

        const contactOptions = _.map(this.props.contacts, ([name, email]) => {
            const label = makeContactLabel([name, email]);
            return {
                label,
                value: [name, email],
                lowercaseLabel: label.toLowerCase(),
            };
        });

        const modules = {
            toolbar: [
                [
                    'bold', 'italic', 'underline', 'blockquote', 'link',
                    {'list': 'ordered'}, {'list': 'bullet'},
                ],
            ],
        };

        const formats = [
            'bold', 'italic', 'underline', 'blockquote', 'link',
            'list', 'bullet',
        ];

        const editorClasses = [];

        if (this.state.editorActive) editorClasses.push('active');
        if (this.props.message && this.state.includeQuote) editorClasses.push('short');

        return (
            <section id="new-email" className={window.KANMAIL_PLATFORM}>
                <HeaderBar />

                <form>
                    <div className="third">
                        <label htmlFor="account">Account</label>
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

                    <div className="two-third">
                        <label htmlFor="to">To</label>
                        {this.renderAddressBookSelect(contactOptions, 'to')}
                    </div>

                    <div className="half">
                        <label htmlFor="cc">CC</label>
                        {this.renderAddressBookSelect(contactOptions, 'cc')}
                    </div>

                    <div className="half">
                        <label htmlFor="bcc">BCC</label>
                        {this.renderAddressBookSelect(contactOptions, 'bcc')}
                    </div>

                    <div className="wide">
                        <label htmlFor="subject">Subject</label>
                        <div id="subject-wrapper">
                            <input
                                id="subject"
                                type="text"
                                value={this.state.subject}
                                onChange={_.partial(this.handleInputChange, 'subject')}
                            />
                        </div>
                    </div>

                    <div className="wide">
                        <label htmlFor="body" id="message-label">Message</label>
                        <div
                            id="textarea-body"
                            className={editorClasses.join(' ')}
                        >
                            <ReactQuill
                                value={this.state.body}
                                onChange={this.handleEditorStateChange}
                                modules={modules}
                                formats={formats}
                                placeholder="Write something..."
                                onFocus={() => this.setState({editorActive: true})}
                                onBlur={() => this.setState({editorActive: false})}
                            />
                        </div>
                    </div>

                    <div className="wide">
                        {this.renderQuote()}
                    </div>

                    <div className="buttons">
                        {this.renderSendButton()}
                        {this.renderSaveButton()}
                        {this.renderAttachButton()}
                    </div>
                </form>
            </section>
        );
    }
}
