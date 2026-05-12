import _ from "lodash";
import React from "react";

import { Settings } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import systemStore from "../../stores/system.ts";
import SettingsView from "./SettingsView.tsx";

@subscribe(settingsStore, systemStore)
export default class SettingsApp extends React.Component<ISettings> {
  private releaseKeyboard: () => void;

  constructor(props) {
    super(props);
    this.releaseKeyboard = keyboard.suspend("SettingsApp");
  }

  componentWillUnmount() {
    this.releaseKeyboard();
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
