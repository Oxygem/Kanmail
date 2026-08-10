import React from "react";

import { AppService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { FEEDBACK_EMAIL, SUPPORT_DOC_LINK } from "../../constants.ts";
import cheatsheetStore from "../../stores/cheatsheet.ts";
import commandStore from "../../stores/command.ts";
import threadStore from "../../stores/thread.ts";
import { trackEvent } from "../../util/analytics.ts";
import { buildAddColumnPage } from "../../util/commands.tsx";
import { openLink } from "../../window.ts";

// Body of the app-generated welcome guide message, rendered as a component
// (rather than email HTML) so the intro can trigger real app actions.
export default class WelcomeMessage extends React.Component {
  handleClickAddColumn = () => {
    trackEvent("WelcomeAddColumn");
    // Close the reader so the board is visible when the new column appears
    threadStore.close();
    commandStore.open(buildAddColumnPage());
  };

  handleClickCompose = () => {
    trackEvent("WelcomeCompose");
    AppService.OpenSendWindow({});
  };

  handleClickShortcuts = () => {
    trackEvent("WelcomeShortcuts");
    cheatsheetStore.open();
  };

  render() {
    return (
      <div className="welcome-message">
        <p>Hey! Welcome to Kanmail 👋</p>
        <p>
          Kanmail treats your inbox like a kanban board:{" "}
          <b>every column is a folder</b> (or label) in your account, and you
          move email through them as you deal with it.
        </p>
        <ul>
          <li>
            <b>Drag &amp; drop</b> — grab any email card and drop it on another
            column to file it there
          </li>
          <li>
            <b>Add columns</b> — use the add column button to add any columns
            you like
          </li>
          <li>
            <b>Workflows</b> — the switcher in the top left holds separate sets
            of columns
          </li>
        </ul>
        <div className="welcome-actions">
          <button onClick={this.handleClickAddColumn}>
            <i className="fa fa-plus" /> Add a column
          </button>
          <button onClick={this.handleClickCompose}>
            <i className="fa fa-pencil-square-o" /> Compose an email
          </button>
          <button onClick={this.handleClickShortcuts}>
            <i className="fa fa-keyboard-o" /> Keyboard shortcuts
          </button>
        </div>
        <p>Kanmail recommends using keyboard shortcuts:</p>
        <ul>
          <li>
            Move around the board using the <kbd>arrow keys</kbd>
          </li>
          <li>
            Use <kbd>backspace</kbd> to delete, <kbd>enter</kbd> to archive and{" "}
            <kbd>m</kbd> to move
          </li>
          <li>
            <kbd>z</kbd> to undo your most recent actions
          </li>
          <li>
            There's also a handy command bar by pressing <kbd>cmd/ctrl+k</kbd>
          </li>
          <li>
            Press <kbd>?</kbd> any time for the full list, change them in
            settings
          </li>
        </ul>
        <p>
          Thank you for trying out Kanmail! If you've any questions or feedback
          I'd love to hear it, you can email me directly:{" "}
          <a onClick={() => openLink(`mailto:${FEEDBACK_EMAIL}`)}>
            {FEEDBACK_EMAIL}
          </a>{" "}
          or <a onClick={() => openLink(SUPPORT_DOC_LINK)}>kanmail.io/support</a>{" "}
          has you covered.
        </p>
        <p>Happy emailing!</p>
      </div>
    );
  }
}
