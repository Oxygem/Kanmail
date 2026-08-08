import React from "react";

import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";

const PURCHASE_URL = "https://kanmail.io/license/buy";

const FEATURES = [
  "One user, unlimited devices",
  "Every past & future v2 release",
  "Exclusive midnight & nord light themes",
  "Experimental features",
  "No subscription, ever",
];

export default class LicensePurchase extends React.Component {
  handlePurchase = (ev) => {
    ev.preventDefault();
    AppService.OpenLink(PURCHASE_URL);
  };

  render() {
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
}
