import _ from "lodash";
import React from "react";

import { Settings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import SettingsView from "./SettingsView.tsx";

@subscribe(settingsStore)
export default class SettingsApp extends React.Component<ISettings> {
  constructor(props) {
    super(props);
    keyboard.disable();
  }

  render() {
    return (
      <section id="settings-app">
        <SettingsView
          updateFn={(settings: Settings) => {
            settingsStore.updateSettings(settings);
          }}
          {...this.props}
        />
      </section>
    );
  }
}
