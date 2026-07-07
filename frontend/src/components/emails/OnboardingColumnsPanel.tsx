import React from "react";
import { subscribe } from "../../stores/base.tsx";
import { getEmailStore } from "../../stores/emails/controller.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import ColumnSelect from "./ColumnSelect.tsx";

@subscribe(settingsStore)
export default class OnboardingColumnsPanel extends React.Component<Partial<ISettings>> {
  handleAdd = (name: string) => {
    settingsStore.addColumn(name);
    getEmailStore().getFolderEmails(name, {});
  };

  render() {
    if (settingsStore.getCurrentColumns().length > 1) {
      return null;
    }

    return (
      <div id="onboarding-columns-panel">
        <div className="content">
          <h2>Kanmail works best with multiple columns</h2>
          <p>
            Each column tracks a folder or label so you can drag emails between
            them like a kanban board.
          </p>
          <div className="select-row">
            <ColumnSelect onAdd={this.handleAdd} />
          </div>
        </div>
      </div>
    );
  }
}
