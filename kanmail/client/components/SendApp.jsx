import _ from 'lodash';
import React from 'react';
import PropTypes from 'prop-types';
import Select, { AsyncCreatable } from 'react-select';
import { EditorState } from 'draft-js';
import { Editor } from 'react-draft-wysiwyg';
import { stateToHTML } from 'draft-js-export-html';
import 'react-draft-wysiwyg/dist/react-draft-wysiwyg.css';

import HeaderBar from 'components/HeaderBar.jsx';

import settingsStore from 'stores/settings.js'
import { subscribe } from 'stores/base.jsx'

import { cleanHtml } from 'util/html.js'
import { post } from 'util/requests.js'


function makeContactLabel(contactTuple) {
    if (!contactTuple[0]) {
        return contactTuple[1];
    }

    return `${contactTuple[0]} (${contactTuple[1]})`;
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

        const firstAccount  = _.keys(props.accounts)[0]
        const includeQuote = this.props.message ? true : false

        this.state = {
            includeQuote: includeQuote,
            account: {
                value: firstAccount,
                label: firstAccount,
            },

            to: [],
            cc: [],
            bcc: [],

            subject: '',

            editorState: EditorState.createEmpty(),

            // "Hidden"/uneditable fields
            replyToMessageId: null,
            replyToMessageReferences: null,
            replyToQuoteHtml: null,

            sending: false,
        }

        if (props.message) {
            const replyToEmails = [];

            this.state = _.extend(this.state, {
                subject: `Re: ${props.message.subject}`,
                from: props.message.to[1],

                account: {
                    value: props.message.account_name,
                    label: props.message.account_name,
                },

                to: _.map(props.message.reply_to, contactTuple => {
                    replyToEmails.push(contactTuple[1]);
                    return {
                        value: contactTuple[1],
                        label: makeContactLabel(contactTuple),
                    };
                }),

                replyToMessageId: props.message.message_id,
                replyToMessageReferences: props.message.originalReferences,
                replyToQuoteHtml: props.message.body,
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

    handleInputChange = (field, ev) => {
        this.setState({
            [field]: ev.target.value,
        })
    }

    handleEditorStateChange = (editorState) => {
        this.setState({
            editorState,
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
            'from', 'subject',
            'replyToMessageId',
            'replyToMessageReferences',
            'replyToQuoteHtml',
        ]);

        const { editorState } = this.state;
        const content = editorState.getCurrentContent();

        emailData.text = content.getPlainText();
        emailData.html = stateToHTML(content);

        const accountName = this.state.account.value;
        emailData.from = this.props.accounts[accountName].addresses[0];

        _.each(['to', 'cc', 'bcc'], key => {
            const value = this.state[key];
            if (!value) {
                return;
            }
            emailData[key] = _.map(value, item => item.value);
        });

        this.setState({
            sending: true,
        });

        post(`/api/emails/${accountName}`, emailData).then(() => {
            window.close();
        });
    }

    handleSelectChange = (field, item) => {
        this.setState({
            [field]: item,
        })
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
                <div id="include-quote">
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
            inputValue = inputValue.toLowerCase();

            const filteredOptions = _.filter(
                contactOptions,
                option => option.label.toLowerCase().includes(inputValue),
            );

            return new Promise(resolve => {
                if (inputValue.length <= 1) {
                    resolve();
                    return;
                }

                setTimeout(() => resolve(filteredOptions), 50);
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

    render() {
        const accountOptions = _.map(this.props.accounts, (_, accountName) => (
            {value: accountName, label: accountName}
        ));

        const contactOptions = _.map(this.props.contacts, (name, email) => (
            {
                value: email,
                label: makeContactLabel([name, email]),
            }
        ));

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
                            value={this.state.account}
                            onChange={_.partial(
                                this.handleSelectChange, 'account',
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
                            className={this.props.message && this.state.includeQuote ? 'short': ''}
                        >
                            <Editor
                                editorClassName="editor"
                                toolbarClassName="editor-toolbar"
                                wrapperClassName="editor-wrapper"
                                onEditorStateChange={this.handleEditorStateChange}
                                toolbar={{
                                    options: ['inline', 'link', 'emoji'],
                                    inline: {
                                        options: ['bold', 'italic', 'underline'],
                                    },
                                }}
                                editorState={this.state.editorState}
                            />
                        </div>
                    </div>

                    <div className="wide">
                        {this.renderQuote()}
                    </div>

                    <button type="submit">
                        <i className={`fa fa-envelope ${this.state.sending ? 'fa-spin' : ''}`}></i> Send
                    </button>
                </form>
            </section>
        );
    }
}
