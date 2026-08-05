import { INBOX, SUPPORT_DOC_LINK } from "../../constants.ts";
import settingsStore from "../settings.ts";
import { IEmail, Thread, makeThread } from "./base.ts";

export const WELCOME_MESSAGE_ID = "kanmail-welcome";

const WELCOME_SUBJECT = "Welcome to Kanmail 👋";
const WELCOME_EXCERPT =
  "A quick tour of your new kanban inbox: columns, drag &amp; drop and the shortcuts worth learning first.";

const kbd = (key: string) =>
  `<kbd style="display: inline-block; background: var(--pill); border-radius: 4px; padding: 0 6px; margin: 0 1px; font-family: inherit; font-size: 14px; line-height: 20px;">${key}</kbd>`;

const WELCOME_BODY = `
<div style="max-width: 640px; line-height: 1.6;">
  <p>Hey! Welcome to Kanmail 👋</p>
  <p>
    Kanmail treats your inbox like a kanban board: <b>every column is a folder</b>
    (or label) in your account, and you move email through them as you deal
    with it.
  </p>
  <ul style="padding-left: 20px;">
    <li><b>Drag &amp; drop</b> &rarr; grab any email card and drop it on another column to file it there</li>
    <li><b>Add columns</b> &rarr; use the add column button to add any columns you like</li>
    <li><b>Workflows</b> &rarr; the switcher in the top left holds separate sets of columns</li>
  </ul>
  <p>
    Kanmail recommends using keyboard shortcuts:
    <ul>
      <li>Move around the board using the ${kbd("arrow keys")}</li>
      <li>Use ${kbd("backspace")} to delete, ${kbd("enter")} to archive and ${kbd("m")} to move</li>
      <li>${(kbd("z"))} to undo your most recent actions</li>
      <li>There's also a handy command bar by pressing ${kbd("cmd/ctrl+k")}</li>
      <li>Press ${kbd("?")} any time for the full list, change them in settings</li>
    </ul>
  </p>
  <p>
    Stuck or found a bug? <a href="${SUPPORT_DOC_LINK}">kanmail.io/support</a>
    has you covered.
  </p>
  <p>Happy emailing!</p>
</div>
`;

function makeWelcomeMessage(): IEmail {
  const account = settingsStore.props.accounts[0];

  return {
    accountID: "",
    folderName: INBOX,
    uid: 0,
    // No \Seen flag so the thread renders as unread until opened
    flags: [],
    date: new Date().toISOString(),
    subject: WELCOME_SUBJECT,
    excerpt: WELCOME_EXCERPT,
    from: [{ name: "Kanmail", email: "hello@kanmail.io" }],
    to: account?.contacts?.length ? [account.contacts[0]] : [],
    cc: [],
    bcc: [],
    messageId: WELCOME_MESSAGE_ID,
    references: [],
    parts: [],
    accountMessageId: WELCOME_MESSAGE_ID,
    folderUids: { [INBOX]: 0 },
    folderUidsVersion: 0,
    originalReferences: [],
    welcome: true,
  } as unknown as IEmail;
}

// One stable thread object per session - EmailColumnThread keys off
// thread.hash and diffs thread props, so the identity must not change
// between renders.
let welcomeThread: Thread | null = null;

export function getWelcomeThread(): Thread {
  if (!welcomeThread) {
    welcomeThread = makeThread([makeWelcomeMessage()]);
  }
  return welcomeThread;
}

export function getWelcomeBodies(): Map<string, string> {
  return new Map([[WELCOME_MESSAGE_ID, WELCOME_BODY]]);
}
