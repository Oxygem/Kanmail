import _ from "lodash";
import React from "react";

import { Settings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard from "../../keyboard.ts";
import settingsStore from "../../stores/settings.ts";
import SettingsView from "../settings/SettingsView.tsx";

interface IWelcomeSettingsState {
  settings: Settings;
}

export default class WelcomeSettings extends React.Component<{}, IWelcomeSettingsState> {
  constructor(props) {
    super(props);
    keyboard.disable();

    this.state = {
      settings: settingsStore.props,
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
