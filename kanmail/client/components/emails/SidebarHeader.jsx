import _ from 'lodash';
import React, { Component } from 'react';
import PropTypes from 'prop-types';

import requestStore from 'stores/request.js';
import { subscribe } from 'stores/base.jsx';


const renderError = (error, key) => {
    return (
        <p key={key}>
            <span className="meta">{error.status}: {error.url}</span>
            {error.errorName}: {error.errorMessage}
        </p>
    );
}


@subscribe(requestStore)
export default class SidebarHeader extends Component {
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
                    <strong>Kanmail encountered a serious sync or UI error, click to reload</strong>
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
            <div className="sidebar-header">
                {this.renderRequestErrors()}
                {this.renderNetworkErrorIcon()}
            </div>
        );
    }
}
