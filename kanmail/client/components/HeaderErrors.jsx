import _ from 'lodash';
import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { SUPPORT_DOC_LINK } from 'constants.js';
import { openLink } from 'window.js';

import requestStore from 'stores/request.js';
import { subscribe } from 'stores/base.jsx';


class RequestError extends Component {
    static propTypes = {
        error: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            copied: false,
        };
    }

    copyDebugInformation = () => {
        this.textarea.select();
        document.execCommand('copy');
        this.setState({copied: true});
    }

    render() {
        const { error } = this.props;
        const traceback = error.json ? (error.json.traceback || null) : null;
        const debugInfo = `URL: ${error.url}
ErrorName: ${error.errorName}
ErrorMessage: ${error.errorMessage}
Kanmail version: ${window.KANMAIL_VERSION}
Status: ${error.status}
${traceback}`;

        const copyText = this.state.copied ? 'copied!' : 'copy error info';

        return (
            <p>
                <span className="meta">{error.status}: {error.url}</span>
                {error.errorName}: {error.errorMessage}
                <button onClick={this.copyDebugInformation}>{copyText}</button>
                <textarea
                    editable="false"
                    value={debugInfo}
                    readOnly={true}
                    ref={(textarea) => {this.textarea = textarea}}
                />
            </p>
        );
    }
}


@subscribe(requestStore)
export default class HeaderErrors extends Component {
    static propTypes = {
        requestErrors: PropTypes.array.isRequired,
        networkErrors: PropTypes.array.isRequired,
    }

    renderRequestErrors() {
        if (!this.props.requestErrors.length) {
            return null;
        }

        return (
            <div className="icon-wrapper">
                <div className="icon-contents">
                    <strong>Kanmail encountered a serious sync or UI error.</strong>
                    <p>Click the icon to reload Kanmail or use the information below to submit a bug report. <a onClick={() => openLink(SUPPORT_DOC_LINK)}>More information</a>.</p>
                    {_.map(
                        this.props.requestErrors,
                        (error, key) => <RequestError error={error} key={key} />,
                    )}
                </div>
                <a onClick={() => window.location.reload()}>
                    <i className="error fa fa-exclamation-triangle"></i> {this.props.requestErrors.length}
                </a>
            </div>
        );
    }

    renderNetworkErrorIcon() {
        if (!this.props.networkErrors.length) {
            return null;
        }

        return (
            <div className="icon-wrapper">
                <div className="icon-contents">
                    <strong>Kanmail cannot connect! Click to clear!</strong>
                    {_.map(
                        this.props.networkErrors,
                        (error, key) => (
                            <p key={key}>
                                <span className="meta">{error.status}: {error.url}</span>
                                {error.errorName}: {error.errorMessage}
                            </p>
                        ),
                    )}
                </div>

                <a onClick={() => requestStore.clearNetworkErrors()}>
                    <i className="error fa fa-bolt"></i> {this.props.networkErrors.length}
                </a>
            </div>
        );
    }

    render() {
        return (
            <div className="header-errors">
                {this.renderRequestErrors()}
                {this.renderNetworkErrorIcon()}
            </div>
        );
    }
}
