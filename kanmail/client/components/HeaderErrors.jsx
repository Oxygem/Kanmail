import _ from 'lodash';
import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { SUPPORT_DOC_LINK } from 'constants.js';
import { openLink } from 'window.js';

import requestStore from 'stores/request.js';
import { subscribe } from 'stores/base.jsx';


const renderError = (error, key) => {
    const traceback = error.json.traceback || null;
    const debugInfo = `URL: ${error.url}
Status: ${error.status}
${traceback}`;

    return (
        <p key={key}>
            <span className="meta">{error.status}: {error.url}</span>
            {error.errorName}: {error.errorMessage}
            {traceback && <textarea editable={false} value={debugInfo} />}
        </p>
    );
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
                    <p>Click the icon to reload Kanmail or use the information below to investigate/submit a bug report. <a onClick={() => openLink(SUPPORT_DOC_LINK)}>More information</a>.</p>
                    {_.map(this.props.requestErrors, renderError)}
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
                    {_.map(this.props.networkErrors, renderError)}
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
