import React from "react";

import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";

interface IErrorInformationProps {
  error: any;
  componentStack: any;
}

interface IErrorInformationState {
  showDebugInfo?: boolean;
}

class ErrorInformation extends React.Component<IErrorInformationProps, IErrorInformationState> {
  constructor(props) {
    super(props)
    this.state = {}
  }

  render() {
    return (
      <div className="error-information">
        <h1>
          <img src="/icon.png" width="24px" /> Something broke!
        </h1>
        <p>
          <a onClick={() => AppService.RestartAfterUpdate()}>Click here to reload!</a>
        </p>
        <p>
          So this is embarrassing - something broke! If this error persists,
          please go to:{" "}
          <a target="_blank" rel="noreferrer" href="https://kanmail.io/support">
            kanmail.io/support
          </a>
          .
        </p>
        <a onClick={() => this.setState({ showDebugInfo: !this.state.showDebugInfo })}>Show debug information {this.state.showDebugInfo ? <>&uarr;</> : <>&darr;</>}</a>
        {this.state.showDebugInfo && <pre><code>{this.props.error}{"\n\n"}{this.props.componentStack}</code></pre>}
      </div>
    );
  }
}

const showErrorInformation = ({ error, componentStack }) => (
  <ErrorInformation error={error} componentStack={componentStack} />
);
export default showErrorInformation;
