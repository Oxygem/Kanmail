import React from "react";

import Tooltip from "../../components/Tooltip.tsx";
import { subscribe } from "../../stores/base.tsx";
import commandStore from "../../stores/command.ts";
import { Thread } from "../../stores/emails/base.ts";
import settingsStore, { ISettings } from "../../stores/settings.ts";
import threadStore from "../../stores/thread.ts";
import { buildAddColumnPage } from "../../util/commands.tsx";

interface IRightbarProps extends Partial<ISettings> {
  thread?: Thread | null;
}

@subscribe(settingsStore)
@subscribe(threadStore)
export default class AddNewColumnForm extends React.Component<IRightbarProps> {
  render() {
    if (this.props.thread != null) {
      return null;
    }

    return (
      <div id="add-column">
        <Tooltip text="Add new column" position={"left"}>
          <a onClick={() => commandStore.open(buildAddColumnPage())}>
            <i className="fa fa-plus"></i>
          </a>
        </Tooltip>
      </div>
    );
  }
}
