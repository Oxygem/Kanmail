import _ from 'lodash';
import React, { Component } from 'react';
import PropTypes from 'prop-types';

import requestStore from 'stores/request.js';
import { subscribe } from 'stores/base.jsx';


@subscribe(requestStore)
export default class FooterStatus extends Component {
    static propTypes = {
        fetchRequests: PropTypes.array.isRequired,
        pushRequests: PropTypes.array.isRequired,
        pendingPushRequests: PropTypes.array.isRequired,
    }

    constructor() {
        super();

        this.state = {
            showStatusBar: false,
        }
    }

    toggleStatusBar = () => {
        this.setState({
            showStatusBar: !this.state.showStatusBar,
        });
    }

    renderStatusBar() {
        if (!this.state.showStatusBar) {
            return null;
        }

        const { fetchRequests, pushRequests, pendingPushRequests } = this.props;

        const fetchRequestItems = _.map(fetchRequests, request => {
            return <p key={request[1]}>{request[1]}</p>;
        });
        const pushRequestItems = _.map(pushRequests, request => (
            <p key={request[1]}>{request[1]}</p>
        ));
        const pendingPushRequestItems = _.map(pendingPushRequests, request => (
            <p key={request[1]}>{request[1]}</p>
        ));

        return (
            <section id="status">
                <div>
                    <h4>
                        <i className="fa fa-arrow-down"></i>
                        {fetchRequests.length} fetching
                    </h4>
                    {fetchRequestItems}
                </div>
                <div>
                    <h4>
                        <i className="fa fa-arrow-up"></i>
                        {pushRequests.length} pushing
                    </h4>
                    {pushRequestItems}
                </div>
                <div>
                    <h4>
                        <i className="fa fa-clock-o"></i>
                        {pendingPushRequests.length} pending pushes
                    </h4>
                    {pendingPushRequestItems}
                </div>
            </section>
        );
    }

    render() {
        const fetchCount = this.props.fetchRequests.length;
        const pushCount = this.props.pushRequests.length;
        const pendingCount = this.props.pendingPushRequests.length;

        return (
            <div>
                <div id="footer-status">
                    <span className={fetchCount > 0 ? 'green' : ''}>
                        <i className="fa fa-arrow-down"></i>
                        {fetchCount}
                    </span>
                    <span className={pushCount > 0 ? 'red' : ''}>
                        <i className="fa fa-arrow-up"></i>
                        {pushCount}
                    </span>
                    <span className={pendingCount > 0 ? 'yellow' : ''}>
                        <i className="fa fa-clock-o"></i>
                        {pendingCount}
                    </span>

                    <span className="toggle">
                        <i
                            className={`fa fa-chevron-circle-${this.state.showStatusBar ? 'down' : 'up'}`}
                            onClick={this.toggleStatusBar}
                        ></i>
                    </span>
                </div>

                {this.renderStatusBar()}
            </div>
        );
    }
}
