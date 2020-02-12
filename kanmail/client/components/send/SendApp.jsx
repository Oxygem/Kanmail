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
        accounts: PropTypes.object.isRequired,
        contacts: PropTypes.object.isRequired,
        message: PropTypes.object,
    }

    constructor(props) {
        super(props);

        let defaultAccount;
        const firstAccount  = _.keys(props.accounts)[0];
        const firstAccountContacts = this.props.accounts[firstAccount].contacts;

        if (firstAccountContacts && firstAccountContacts.length > 0) {
            defaultAccount = makeAccountContactOption(
                firstAccount, firstAccountContacts[0],
            );
        } else {
            defaultAccount = this.getDefaultAccount(firstAccount);
        }

        const includeQuote = this.props.message ? true : false;

        this.state = {
            includeQuote: includeQuote,
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

            sending: false,
            errorName: null,
            errorMessage: null,
        }

        if (props.message) {
            const replyToEmails = [];

            let subject = props.message.subject;
            if (props.message.forward) {
                subject = prependIfNotPresent(subject, 'Fwd');
            } else {
                subject = prependIfNotPresent(subject, 'Re')
            }

            let replyAccount;
            const accountName = props.message.account_name;
            const accountContacts = this.props.accounts[accountName].contacts;

            if (accountContacts && accountContacts.length > 0) {
                replyAccount = makeAccountContactOption(
                    accountName, accountContacts[0],
                );
            } else {
                replyAccount = this.getDefaultAccount(accountName);
            }

            let to = [];
            if (!props.message.forward) {
                to = _.map(props.message.reply_to, contactTuple => {
                    replyToEmails.push(contactTuple[1]);
                    return {
                        value: contactTuple[1],
                        label: makeContactLabel(contactTuple),
                    };
                });
            }

            this.state = _.extend(this.state, {
                subject, to,
                accountContact: replyAccount,

                replyToMessageId: props.message.message_id,
                replyToMessageReferences: props.message.originalReferences,
                replyToQuoteHtml: props.message.body.html || props.message.body.text,
            });

            if (props.message.reply_all) {
                const newTos = _.filter(_.map(props.message.to,
                    contactTuple => ({
                        value: contactTuple[1],
                        label: makeContactLabel(contactTuple),
                    }),
                ), item => !_.includes(replyToEmails, item.value));

                this.state = _.extend(this.state, {
                    to: this.state.to.concat(newTos),

                    cc: _.map(props.message.cc, contactTuple => ({
                        value: contactTuple[1],
                        label: makeContactLabel(contactTuple),
                    })),

                    bcc: _.map(props.message.bcc, contactTuple => ({
                        value: contactTuple[1],
                        label: makeContactLabel(contactTuple),
                    })),
                });
            }
        }
    }

    getDefaultAccount = (accountName) => {
        const smtpUsername = (
            this.props.accounts[accountName].smtp_connection.username
        );

        return makeAccountContactOption(
            accountName,
            [smtpUsername, smtpUsername],
        );
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

    handleSubmit = (ev) => {
        ev.preventDefault();

        if (this.state.sending) {
            return;
        }

        const emailData = _.pick(this.state, [
            'subject',
            'attachments',
            'replyToMessageId',
            'replyToMessageReferences',
            'replyToQuoteHtml',
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

        this.setState({
            sending: true,
        });

        post(`/api/emails/${accountTuple[0]}`, emailData).then(() => {
            closeWindow();
        }).catch((e) => {
            const errorData = e.data;

            if (errorData) {
                this.setState({
                    sending: false,
                    errorName: errorData.error_name,
                    errorMessage: errorData.error_message,
                });
            } else {
                this.setState({
                    errorName: 'Unknown',
                    errorMessage: 'Unexpected error, plese reload Kanmail!',
                })
            }
        });
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
        const buttonClasses = ['send-button'];
        let buttonText = this.state.sending ? 'Sending...' : 'Send';

        if (this.state.errorName || this.state.errorMessage) {
            buttonText = `${this.state.errorName}: ${this.state.errorMessage}`;
            buttonClasses.push('error');
        }

        if (this.state.sending) {
            buttonClasses.push('sending');
        }

        return (
            <button
                type="submit"
                className={buttonClasses.join(' ')}
            >
                <i className={`fa ${this.state.sending ? 'fa-spin fa-refresh' : 'fa-envelope'}`}></i> {buttonText}
            </button>
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
                className="attach-button"
                onClick={this.handleClickAttach}
            ><i className="fa fa-attach" />{buttonText}{attachments}</button>
        );
    }

    render() {
        const accountOptions = _.reduce(
            this.props.accounts,
            (memo, key, accountName) => {
                const accountContacts = this.props.accounts[accountName].contacts;
                if (accountContacts && accountContacts.length > 0) {
                    return _.concat(memo, _.map(
                        accountContacts,
                        nameEmail => makeAccountContactOption(
                            accountName, nameEmail,
                        ),
                    ));
                }
                memo.push(this.getDefaultAccount(accountName));
                return memo;
            },
            [],
        );

        const contactOptions = _.map(this.props.contacts, ([name, email]) => {
            const label = makeContactLabel([name, email]);
            return {
                label,
                value: email,
                lowercaseLabel: label.toLowerCase(),
            }
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
            <section id="new-email">
                <HeaderBar />

                <form onSubmit={this.handleSubmit}>
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

                    {this.renderSendButton()}
                    {this.renderAttachButton()}
                </form>
            </section>
        );
    }
}
