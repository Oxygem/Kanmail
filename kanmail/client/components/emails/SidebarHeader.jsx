import _ from 'lodash';
import React, { Component } from 'react';
import PropTypes from 'prop-types';

import requestStore from 'stores/request.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(requestStore)
export default class SidebarHeader extends Component {
    static propTypes = {
        requestErrors: PropTypes.array.isRequired,
    }

    renderErrors() {
        if (!this.props.requestErrors.length) {
            return null;
        }

        const errors = _.map(this.props.requestErrors, error => (
            <p>{error.errorName}: {error.errorMessage}</p>
        ));

        return (
            <div className="icon-wrapper">
                <i className="error fa fa-exclamation-triangle"></i>&nbsp;
                {this.props.requestErrors.length}
                <div className="icon-contents">{errors}</div>
            </div>
        );
    }

    render() {
        return (
            <div className="sidebar-header">
                {this.renderErrors()}
            </div>
        );
    }
}
