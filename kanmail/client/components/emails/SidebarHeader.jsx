import _ from 'lodash';
import React, { Component } from 'react';
import PropTypes from 'prop-types';

import requestStore from 'stores/request.js';
import { subscribe } from 'stores/base.jsx';


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

        const errors = _.map(this.props.requestErrors, (error, i) => (
            <p key={i}>{error.errorName}: {error.errorMessage}</p>
        ));

        return (
            <div className="icon-wrapper">
                <div className="icon-contents">
                    <strong>Kanmail encountered a serious sync or UI error, click to reload</strong>
                    {errors}
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

        const errors = _.map(this.props.networkErrors, (error, i) => (
            <p key={i}>{error.errorName}: {error.errorMessage}</p>
        ));

        return (
            <div className="icon-wrapper">
                <div className="icon-contents">
                    <strong>Kanmail cannot connect!</strong>
                    {errors}
                </div>
                <i className="error fa fa-bolt"> {this.props.networkErrors.length}</i>
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
