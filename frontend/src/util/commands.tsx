import _ from "lodash";
import React from "react";

import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import type EmailColumnThread from "../components/emails/EmailColumnThread.tsx";
import keyboard from "../keyboard.ts";
import cheatsheetStore from "../stores/cheatsheet.ts";
import commandStore, { CommandOption, CommandPage } from "../stores/command.ts";
import { getEmailStore } from "../stores/emails/controller.ts";
import requestStore from "../stores/request.ts";
import searchStore from "../stores/search.ts";
import settingsStore from "../stores/settings.ts";
import { trackEvent } from "./analytics.ts";
import {
  buildAddColumnOptions,
  buildMoveFolderOptions,
  getMoveDataFromThreadComponent,
  moveOrCopyThread,
} from "./threads.ts";

// The reused thread handlers are written for React mouse/keyboard events and
// call stopPropagation unconditionally.
function fakeEvent() {
  return {
    stopPropagation: () => {},
    preventDefault: () => {},
    shiftKey: false,
  };
}

export function buildAddColumnPage(): CommandPage {
  return {
    header: "Add column...",
    options: buildAddColumnOptions(),
    creatable: true,
    placeholder: "Column name...",
    onSelect: (option) => {
      const value = (option.value || option.label || "").trim();
      settingsStore.addColumn(value);
    },
  };
}

function setAccountFilter(accountID: string | null) {
  settingsStore.setCurrentAccount(accountID);
  // The column date watermark depends on the account filter, rebuild threads
  getEmailStore().processEmailChanges({ forceProcess: true });
  trackEvent("AccountFilter");
}

export function buildMovePage(component: EmailColumnThread): CommandPage {
  const subject = component.props.thread[0].subject;
  const moveData = getMoveDataFromThreadComponent(component);

  return {
    header: (
      <span>
        Move <strong>{subject}</strong>...
      </span>
    ),
    options: buildMoveFolderOptions(component.props.columnId),
    creatable: true,
    onSelect: (option) => {
      moveOrCopyThread(moveData, option.value, keyboard.setMovingCurrentThread);
    },
  };
}

export function buildRootPage(): CommandPage {
  const component = keyboard.currentComponent;

  const actions = new Map<string, () => CommandPage | void>();
  const threadOptions: CommandOption[] = [];
  const appOptions: CommandOption[] = [];

  const addOption = (
    options: CommandOption[],
    value: string,
    label: string,
    action: () => CommandPage | void,
  ) => {
    options.push({ value, label });
    actions.set(value, action);
  };

  if (component) {
    addOption(threadOptions, "thread.archive", "Archive", () => {
      keyboard.archiveCurrentThread(fakeEvent());
    });
    // The welcome thread only exists locally, there's nowhere to move it to
    if (!component.isWelcome()) {
      addOption(threadOptions, "thread.move", "Move to folder...", () =>
        buildMovePage(component),
      );
    }
    addOption(threadOptions, "thread.trash", "Move to trash", () => {
      keyboard.trashCurrentThread(fakeEvent());
    });
    addOption(
      threadOptions,
      "thread.star",
      component.state.starred ? "Unstar" : "Star",
      () => {
        component.handleClickStar(fakeEvent());
      },
    );
    addOption(threadOptions, "thread.reply", "Reply", () => {
      component.handleClickReply(fakeEvent());
    });
    addOption(threadOptions, "thread.replyAll", "Reply all", () => {
      component.handleClickReplyAll(fakeEvent());
    });
    addOption(threadOptions, "thread.forward", "Forward", () => {
      component.handleClickForward(fakeEvent());
    });
  }

  addOption(appOptions, "app.addColumn", "Add column...", () =>
    buildAddColumnPage(),
  );
  settingsStore.props.columnGroups
    .map((group, index) => ({ group, index }))
    .filter(({ index }) => index !== settingsStore.props.currentColumnGroupIndex)
    .forEach(({ group, index }) => {
      addOption(
        appOptions,
        `app.switchWorkflow.${index}`,
        `Switch workflow: ${group.name}`,
        () => {
          settingsStore.switchColumnGroup(index, "command");
        },
      );
    });
  if (settingsStore.props.currentAccount) {
    addOption(appOptions, "app.accountFilter.all", "Show all accounts", () => {
      setAccountFilter(null);
    });
  }
  settingsStore.props.accounts
    .filter((account) => account.id !== settingsStore.props.currentAccount)
    .forEach((account) => {
      addOption(
        appOptions,
        `app.accountFilter.${account.id}`,
        `Filter by account: ${account.name}`,
        () => {
          setAccountFilter(account.id);
        },
      );
    });
  addOption(appOptions, "app.compose", "Compose new email", () => {
    AppService.OpenSendWindow({});
  });
  addOption(appOptions, "app.search", "Search", () => {
    searchStore.focus();
  });
  addOption(appOptions, "app.undo", "Undo last action", () => {
    requestStore.undo();
  });
  addOption(appOptions, "app.settings", "Open settings", () => {
    AppService.OpenSettingsWindow("");
  });
  addOption(appOptions, "app.cheatsheet", "Show keyboard shortcuts", () => {
    cheatsheetStore.open();
  });

  const groups: { label: string; options: CommandOption[] }[] = [];
  if (threadOptions.length > 0) {
    groups.push({ label: "Thread", options: threadOptions });
  }
  groups.push({ label: "App", options: appOptions });

  const subject = component?.props.thread[0].subject;

  return {
    header: subject ? (
      <span>
        Commands for <strong>{subject}</strong>
      </span>
    ) : (
      "Commands"
    ),
    options: groups,
    placeholder: "Type a command...",
    onSelect: (option) => actions.get(option.value)?.(),
  };
}

export function openCommandBar() {
  commandStore.open(buildRootPage());
  trackEvent("OpenCommandBar");
}
