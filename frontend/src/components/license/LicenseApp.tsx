import React from "react";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { subscribe } from "../../stores/base.tsx";
import systemStore from "../../stores/system.ts";
import { trackCaughtError } from "../../util/analytics.ts";

const PURCHASE_URL = "https://kanmail.io/license";

const FEATURES = [
  "One user, unlimited devices",
  "Every past & future v2 release",
  "Exclusive midnight & nord light themes",
  "Experimental features",
  "No subscription, ever",
];

interface ILicenseAppState {
  isSaving?: boolean;
  error?: string;
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
      trackCaughtError("ValidateLicense", e);
    });
  };

  handleRemoveLicense = (ev) => {
    ev.preventDefault();

    AppService.RemoveLicense().then(() => {
      this.setState({ isSaving: false, license: "", error: undefined });
    }).catch((e) => {
      this.setState({ isSaving: false, error: `${e}` });
      trackCaughtError("RemoveLicense", e);
    });
  };

  handlePurchase = (ev) => {
    ev.preventDefault();
    AppService.OpenLink(PURCHASE_URL);
  };

  renderPurchase() {
    return (
      <div className="license-col purchase">
        <div className="plan">Personal</div>
        <div className="price"><span className="amount">$49</span></div>
        <div className="price-note">one time — yours forever</div>

        <div className="divider" />

        <ul className="features">
          {FEATURES.map((feature) => (
            <li key={feature}>
              <span className="dot" />
              {feature}
            </li>
          ))}
        </ul>

        <button type="button" className="btn-primary" onClick={this.handlePurchase}>
          Buy your license →
        </button>
      </div>
    );
  }

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
      <section id="license-app" className="no-select">
        <header className="titlebar">
          <span className="title">Manage License</span>
        </header>

        <div className="km-license">
          {!isLicensed && this.renderPurchase()}
          {!isLicensed && <div className="col-divider" />}
          {this.renderActivate()}
        </div>
      </section>
    );
  }
}
