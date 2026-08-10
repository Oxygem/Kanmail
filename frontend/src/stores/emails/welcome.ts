import { INBOX } from "../../constants.ts";
import settingsStore from "../settings.ts";
import { IEmail, Thread, makeThread } from "./base.ts";

const WELCOME_MESSAGE_ID = "kanmail-welcome";

const WELCOME_SUBJECT = "Welcome to Kanmail 👋";
const WELCOME_EXCERPT =
  "A quick tour of your new kanban inbox: columns, drag &amp; drop and the shortcuts worth learning first.";

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
