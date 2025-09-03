import _ from "lodash";
import PropTypes from "prop-types";
import React, { Component } from "react";

import { subscribe } from "../../stores/base.tsx";
import requestStore, { IRequestStoreProps } from "../../stores/request.ts";

interface FooterStatusState {
  showStatusBar: boolean;

}
@subscribe(requestStore)
export default class FooterStatus extends Component<IRequestStoreProps, FooterStatusState> {
  static propTypes = {
    fetchRequests: PropTypes.array.isRequired,
    pushRequests: PropTypes.array.isRequired,
    pendingRequests: PropTypes.array.isRequired,
  };

  constructor(props: IRequestStoreProps) {
    super(props);

    this.state = {
      showStatusBar: false,
    };
  }

  toggleStatusBar = () => {
    this.setState({
      showStatusBar: !this.state.showStatusBar,
    });
  };

  renderStatusBar() {
    if (!this.state.showStatusBar) {
      return null;
    }

    const { fetchRequests, pushRequests, pendingRequests } = this.props;

    const fetchRequestItems: React.JSX.Element[] = [];
    fetchRequests.forEach(s => {
      fetchRequestItems.push(<li>{s}</li>);
    })

    const pushRequestItems: React.JSX.Element[] = [];
    pushRequests.forEach(s => {
      pushRequestItems.push(<li>{s}</li>);
    })

    const pendingPushRequestItems = _.map(pendingRequests, (request) => (
      // <p key={request[1]}>{request[1]}</p>
      null
    ));

    return (
      <section id="status">
        <div>
          <h4>
            <i className="fa fa-arrow-down"></i>
            {fetchRequests.size} fetching
          </h4>
          {fetchRequestItems}
        </div>
        <div>
          <h4>
            <i className="fa fa-arrow-up"></i>
            {pushRequests.size} pushing
          </h4>
          {pushRequestItems}
        </div>
        <div>
          <h4>
            <i className="fa fa-clock-o"></i>
            {pendingRequests.length} pending pushes
          </h4>
          {pendingPushRequestItems}
        </div>
      </section>
    );
  }

  render() {
    const fetchCount = this.props.fetchRequests.size;
    const pushCount = this.props.pushRequests.size;;
    const pendingCount = this.props.pendingRequests.length;

    return (
      <div>
        <div id="footer-status">
          <span className={fetchCount > 0 ? "green" : ""}>
            <i className="fa fa-arrow-down"></i>
            {fetchCount}
          </span>
          <span className={pushCount > 0 ? "red" : ""}>
            <i className="fa fa-arrow-up"></i>
            {pushCount}
          </span>
          <span className={pendingCount > 0 ? "yellow" : ""}>
            <i className="fa fa-clock-o"></i>
            {pendingCount}
          </span>

          <span className="toggle">
            <i
              className={`fa fa-chevron-circle-${this.state.showStatusBar ? "down" : "up"
                }`}
              onClick={this.toggleStatusBar}
            ></i>
          </span>
        </div>

        {this.renderStatusBar()}
      </div>
    );
  }
}
