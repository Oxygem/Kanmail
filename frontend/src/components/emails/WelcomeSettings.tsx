import _ from "lodash";
import React from "react";

import { SettingsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { AccountSettings, Settings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard from "../../keyboard.ts";
import { ISettings } from "../../stores/settings.ts";
import { arrayMove } from "../../util/array.ts";
import { makeDragElement } from "../../window.ts";
import AccountForm from "../settings/AccountForm.jsx";
import NewAccountForm from "../settings/NewAccountForm.tsx";
import SettingsView from "../settings/SettingsView.tsx";

interface IWelcomeSettingsState {
  settings: Settings;
}

export default class WelcomeSettings extends React.Component<{}, IWelcomeSettingsState> {
  constructor(props) {
    super(props);
    keyboard.disable();

    const settings = new Settings();
    settings.system.loadContactIcons = true;
    settings.system.shareCrashAnalytics = true;

    this.state = {
      settings,
    }
  }

  render() {

    return (
      <section>
        <section id="welcome-settings">
          <p>
            Welcome to Kanmail. Setup one or more accounts below to start
            managing your emails.
          </p>
          <SettingsView
            isWelcomeSettings={true}
            updateFn={(settings: Partial<Settings>) => {
              this.setState({
                settings: {
                  ...this.state.settings,
                  ...settings,
                }
              })
            }}
            {...this.state.settings}
          />
        </section>
      </section>
    );
  }
}
