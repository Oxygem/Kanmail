import React from "react";
import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { subscribe } from "../../stores/base.tsx";
import systemStore from "../../stores/system.ts";

interface ILicenseAppState {
  isSaving?: boolean;
  isSaved?: boolean;
  error?: any;
  license: string;
}

@subscribe(systemStore)
export default class LicenseApp extends React.Component<{}, ILicenseAppState> {
  constructor(props) {
    super(props);

    this.state = {
      license: "",
    };
  }

  handleLicenseUpdate = (ev) => {
    this.setState({
      license: ev.target.value,
    });
  };

  handleValidateLicense = (ev) => {
    ev.preventDefault();

    if (this.state.isSaving) {
      return;
    }

    this.setState({ isSaving: true });

    AppService.ValidateLicense(this.state.license).then((isValid) => {
      this.setState({
        isSaving: false,
        isSaved: isValid,
        error: isValid ? undefined : "Invalid license key",
      })
    }).catch(e => {
      this.setState({ isSaving: false, error: `${e}` })
    })
  };

  handleRemoveLicense = (ev) => {
    ev.preventDefault();

    AppService.RemoveLicense().then(() => {
      this.setState({ isSaving: false, license: "" })
    }).catch(e => {
      this.setState({ isSaving: false, error: `${e}` })
    })
  };

  renderSaveButton() {
    return (
      <button
        type="submit"
        className="main-button submit"
        onClick={this.handleValidateLicense}
        disabled={this.state.isSaving}
      >
        Validate license key &rarr;
      </button>
    );
  }

  renderContent() {
    if (systemStore.props.isLicensed) {
      return (
        <div>
          <p>Thank you for purchasing a Kanmail license!</p>
          <form>
            <button
              type="submit"
              className="main-button cancel"
              onClick={this.handleRemoveLicense}
            >
              Remove license
            </button>
          </form>
        </div>
      );
    }

    return (
      <div>
        <p>
          Hello Kanmail user! Kanmail is developed by a tiny team and a single
          license key purchase goes a long way. If you use Kanmail regularly and
          get value out of it, please consider <a onClick={() => AppService.OpenLink("https://kanmail.io/license")}>
            purchasing a license
          </a>
          .
        </p>
        {this.state.error && <p className="message-block error">{this.state.error}</p>}
        <form>
          <textarea
            placeholder="Paste license here"
            value={this.state.license}
            onChange={this.handleLicenseUpdate}
            rows={1}
          ></textarea>

          {this.renderSaveButton()}
        </form>
      </div>
    );
  }

  render() {
    return (
      <section className="no-select">
        <header className="meta header-bar">
          Manage License
        </header>

        <section id="license">
          <h2>Kanmail License</h2>
          {this.renderContent()}
        </section>
      </section>
    );
  }
}
