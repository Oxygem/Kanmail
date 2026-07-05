import _ from "lodash";
import React, { Component } from "react";

import { SUPPORT_DOC_LINK } from "../constants.ts";
import { openLink } from "../window.ts";

import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { subscribe } from "../stores/base.tsx";
import requestStore, { IRequestStoreProps, RuntimeError } from "../stores/request.ts";

class RequestError extends Component<RuntimeError, {
  copied: boolean;
}> {
  textarea: HTMLTextAreaElement | null;

  constructor(props) {
    super(props);

    this.state = {
      copied: false,
    };
  }

  copyDebugInformation = () => {
    this.textarea!.select();
    document.execCommand("copy");
    this.setState({ copied: true });
  };

  render() {
    //     const traceback = error.json ? error.json.traceback || null : null;
    //     const debugInfo = `URL: ${error.url}
    // ErrorName: ${this.props.message}
    // ErrorMessage: ${error.errorMessage}
    // Kanmail version: ${window.KANMAIL_VERSION}
    // Status: ${error.status}
    // ${traceback}`;

    const debugInfo = this.props.message;
    const copyText = this.state.copied ? "copied!" : "copy error info";

    return (
      <p>
        <span className="meta">
          {this.props.action}
          {this.props.accountName && ": " + this.props.accountName}
          {this.props.folderName && "/" + this.props.folderName}
        </span>
        {/*<button onClick={this.copyDebugInformation}>{copyText}</button>*/}
        <textarea
          disabled={true}
          value={debugInfo}
          readOnly={true}
          ref={(textarea) => {
            this.textarea = textarea;
          }}
        />
      </p>
    );
  }
}

@subscribe(requestStore)
export default class HeaderErrors extends Component<IRequestStoreProps> {
  renderRequestErrors() {
    if (!this.props.requestErrors.length) {
      return null;
    }

    return (
      <div className="icon-wrapper">
        <div className="icon-contents">
          <strong>Kanmail encountered a serious sync or UI error.</strong>
          <p>
            Click the icon to restart Kanmail. Please consider submitting a bug
            report with the information below.{" "}
            <a onClick={() => openLink(SUPPORT_DOC_LINK)}>More information</a>.
          </p>
          {_.map(this.props.requestErrors, (error, key) => (
            <RequestError {...error} key={key} />
          ))}
          <button onClick={() => requestStore.clearRequestErrors()}>
            Clear all errors
          </button>
        </div>
        <a onClick={() => AppService.RestartApp()}>
          <i className="error fa fa-exclamation-triangle"></i>{" "}
          {this.props.requestErrors.length}
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
          {_.map(this.props.networkErrors, (error, key) => (
            <p key={key}>
              <span className="meta">
                {error.message}
              </span>
              {JSON.stringify(error.error)}
            </p>
          ))}
        </div>

        <a onClick={() => requestStore.clearNetworkErrors()}>
          <i className="error fa fa-bolt"></i> {this.props.networkErrors.length}
        </a>
      </div>
    );
  }

  render() {
    if (!this.props.requestErrors.length && !this.props.networkErrors.length) {
      return null;
    }

    return (
      <div className="header-errors">
        {this.renderRequestErrors()}
        {this.renderNetworkErrorIcon()}
      </div>
    );
  }
}
