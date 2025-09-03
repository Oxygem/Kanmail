import React from "react";

import keyboard from "../../keyboard.ts";

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
            This is{" "}
            {/*<a onClick={() => openLink(window.)}>*/}
            Kanmail vVERSION
            {/*</a>*/}
            .
          </p>
          <p>
            {/*<a onClick={() => openWindow("/meta-file/CHANGELOG.md")}>*/}
            Changelog
            {/*</a>*/}
            &nbsp;&bull;&nbsp;
            {/*<a onClick={() => openWindow("/meta-file/LICENSE.md")}>License</a>*/}
          </p>
        </section>
      </section>
    );
  }
}
