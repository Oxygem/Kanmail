import React from "react";

interface IErrorInformationProps {
  error: any;
  componentStack: any;
}

class ErrorInformation extends React.Component<IErrorInformationProps> {
  render() {
    return (
      <div>
        <h1>
          <img src="/favicon.ico" /> Something broke!
        </h1>
        <p>
          <a onClick={() => window.location.reload()}>Click here to reload!</a>
        </p>
        <p>
          So this is embarrassing - something broke! If this error persists,
          please go to:{" "}
          <a target="_blank" rel="noreferrer" href="https://kanmail.io/support">
            kanmail.io/support
          </a>
          .
        </p>
        <pre>
          <code>{this.props.componentStack}</code>
          <code>{this.props.error}</code>
        </pre>
      </div>
    );
  }
}

const showErrorInformation = ({ error, componentStack }) => (
  <ErrorInformation error={error} componentStack={componentStack} />
);
export default showErrorInformation;
