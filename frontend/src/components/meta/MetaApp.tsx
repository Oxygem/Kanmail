import React from "react";

import keyboard from "../../keyboard.ts";
import { subscribe } from "../../stores/base.tsx";
import systemStore from "../../stores/system.ts";

@subscribe(systemStore)
export default class MetaApp extends React.Component {
  private releaseKeyboard: () => void;

  constructor(props) {
    super(props);
    this.releaseKeyboard = keyboard.suspend("MetaApp");
  }

  componentDidMount() {
    systemStore.checkCurrentVersion();
  }

  componentWillUnmount() {
    this.releaseKeyboard();
  }

  render() {
    return (
      <section className="no-select">
        <section id="meta">
          <h2>
            Kanmail
          </h2>
          <p>
            This is Kanmail v{systemStore.props.currentVersion}
            .
          </p>
        </section>
      </section>
    );
  }
}
