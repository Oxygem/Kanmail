import React from "react";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { subscribe } from "../../stores/base.tsx";
import requestStore from "../../stores/request.ts";
import systemStore from "../../stores/system.ts";
import LicensePurchase from "../LicensePurchase.tsx";

interface ILicenseSettingsState {
  isSaving?: boolean;
  error?: string;
  license: string;
}

@subscribe(systemStore)
export default class LicenseSettings extends React.Component<{}, ILicenseSettingsState> {
  constructor(props) {
    super(props);

    this.state = {
      license: "",
    };
  }

  handleLicenseUpdate = (ev) => {
    this.setState({ license: ev.target.value });
  };

  handleValidateLicense = (ev) => {
    ev.preventDefault();

    if (this.state.isSaving || !this.state.license.trim()) {
      return;
    }

    this.setState({ isSaving: true, error: undefined });

    AppService.ValidateLicense(this.state.license.trim()).then((isValid) => {
      this.setState({
        isSaving: false,
        error: isValid ? undefined : "That license key is not valid",
      });
    }).catch((e) => {
      this.setState({ isSaving: false, error: `${e}` });
      requestStore.addError("Failed to validate license", e, { silent: true });
    });
  };

  handleRemoveLicense = (ev) => {
    ev.preventDefault();

    AppService.RemoveLicense().then(() => {
      this.setState({ isSaving: false, license: "", error: undefined });
    }).catch((e) => {
      this.setState({ isSaving: false, error: `${e}` });
      requestStore.addError("Failed to remove license", e, { silent: true });
    });
  };

  renderActivate() {
    const isLicensed = systemStore.props.isLicensed;

    return (
      <div className="license-col activate">
        <h3 className="sub">{isLicensed ? "Licensed" : "Have a license key?"}</h3>
        <p className="help-text">
          {isLicensed
            ? "Thank you for purchasing a Kanmail license!"
            : "Paste it below to unlock Kanmail on this device."}
        </p>

        {this.state.error && (
          <p className="license-error">{this.state.error}</p>
        )}

        {!isLicensed && (
          <form onSubmit={this.handleValidateLicense}>
            <textarea
              className="license-key"
              placeholder="Paste your license key here"
              value={this.state.license}
              onChange={this.handleLicenseUpdate}
              rows={3}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={this.state.isSaving}
            >
              {this.state.isSaving ? "Validating…" : "Validate license key →"}
            </button>
          </form>
        )}

        {isLicensed && (
          <form className="remove-form" onSubmit={this.handleRemoveLicense}>
            <button type="submit" className="btn-danger">
              Remove license
            </button>
          </form>
        )}
      </div>
    );
  }

  render() {
    const isLicensed = systemStore.props.isLicensed;

    return (
      <div className="km-license">
        {!isLicensed && <LicensePurchase />}
        {!isLicensed && <div className="col-divider" />}
        {this.renderActivate()}
      </div>
    );
  }
}
