export const INBOX = "inbox";

export const ALWAYS_SYNC_FOLDERS = [INBOX, "archive", "sent", "trash"];

export const ALIAS_FOLDERS = [
  // this defines the display order
  INBOX,
  "sent",
  "drafts",
  "archive",
  "spam",
  "trash",
];

export const ALIAS_TO_ICON = {
  [INBOX]: "inbox",
  sent: "paper-plane",
  drafts: "pencil",
  archive: "archive",
  trash: "trash",
  spam: "exclamation-triangle",
};

export const PROVIDERS_DOC_LINK = "https://kanmail.io/docs/email-providers";
export const SUPPORT_DOC_LINK = "https://kanmail.io/support";

export const THEME_NAMES = ["default", "default-dark", "default-light"];

export const APPLE_APP_PASSWORD_LINK =
  "https://support.apple.com/en-gb/HT204397";
