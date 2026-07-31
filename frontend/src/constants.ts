export const INBOX = "inbox";

export const ALIAS_FOLDERS = [
  // this defines the display order
  INBOX,
  "sent",
  "drafts",
  "archive",
  "junk",
  "trash",
];

// Folders searched in addition to the visible columns, shown in the special
// search results column on the far right.
export const SEARCH_EXTRA_FOLDERS = ["archive", "trash"];

export const ALIAS_TO_ICON = {
  [INBOX]: "inbox",
  sent: "paper-plane",
  drafts: "pencil",
  archive: "archive",
  trash: "trash",
  junk: "exclamation-triangle",
};

export const SETUP_IMAP_DOC_LINK = "https://kanmail.io/docs/setup-imap/";
export const SETUP_GMAIL_DOC_LINK = "https://kanmail.io/docs/setup-gmail/";
export const SETUP_OUTLOOK_DOC_LINK = "https://kanmail.io/docs/setup-outlook/";
export const SUPPORT_DOC_LINK = "https://kanmail.io/support";

export const THEME_NAMES = ["default", "default-dark", "default-light"];

export const APPLE_APP_PASSWORD_LINK =
  "https://support.apple.com/en-gb/HT204397";

export const ACCOUNT_ACCENT_COLORS = [
  "#2196f3", "#4caf50", "#9c27b0", "#ff9800",
  "#00bcd4", "#673ab7", "#8bc34a", "#3f51b5",
  "#009688", "#03a9f4", "#cddc39", "#ffc107",
  "#e91e63", "#795548", "#607d8b", "#ffeb3b",
  "#ff5722", "#f44336",
];
