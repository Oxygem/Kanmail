import PropTypes from "prop-types";
import React, { Component } from "react";

import { subscribe } from "../../stores/base.tsx";
import requestStore, { IRequestStoreProps } from "../../stores/request.ts";

interface FooterStatusState {
  enabled: boolean;
}

@subscribe(requestStore)
export default class FooterStatus extends Component<IRequestStoreProps, FooterStatusState> {
  static propTypes = {
    fetchRequests: PropTypes.array.isRequired,
    pushRequests: PropTypes.array.isRequired,
    pendingRequests: PropTypes.array.isRequired,
  };

  state: FooterStatusState = {
    enabled: false,
  };

  toggleEnabled = () => {
    this.setState({ enabled: !this.state.enabled });
  };

  renderStatusList(open: boolean) {
    const { fetchRequests, pushRequests, pendingRequests } = this.props;

    const entries: { id: number; name: string; cls: string }[] = [];
    fetchRequests.forEach((name, id) => entries.push({ id, name, cls: "green" }));
    pushRequests.forEach((name, id) => entries.push({ id, name, cls: "red" }));
    pendingRequests.forEach((p) => entries.push({ id: p.id, name: p.name, cls: "yellow" }));
    entries.sort((a, b) => a.id - b.id);

    return (
      <div id="status-list" className={open ? "open" : ""}>
        <ul>
          {entries.length === 0 ? (
            <li className="idle">Idling...</li>
          ) : (
            entries.map((e) => (
              <li key={e.id} className={e.cls}>{e.name}</li>
            ))
          )}
        </ul>
      </div>
    );
  }

  render() {
    const fetchCount = this.props.fetchRequests.size;
    const pushCount = this.props.pushRequests.size;
    const pendingCount = this.props.pendingRequests.length;

    return (
      <div>
        {this.renderStatusList(this.state.enabled)}

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
              className={`fa fa-chevron-circle-${this.state.enabled ? "down" : "up"}`}
              onClick={this.toggleEnabled}
            ></i>
          </span>
        </div>
      </div>
    );
  }
}
