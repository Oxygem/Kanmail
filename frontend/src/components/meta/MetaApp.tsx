import React from "react";

import keyboard from "../../keyboard.ts";
import systemStore from "../../stores/system.ts";

export default class MetaApp extends React.Component {
  constructor(props) {
    super(props);
    keyboard.disable();
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
