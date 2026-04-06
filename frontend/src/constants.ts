export const INBOX = "inbox";

export const ALWAYS_SYNC_FOLDERS = ["sent", "drafts", "archive", "trash"];

export const ALIAS_FOLDERS = [
  // this defines the display order
  INBOX,
  "sent",
  "drafts",
  "archive",
  "junk",
  "trash",
];

export const ALIAS_TO_ICON = {
  [INBOX]: "inbox",
  sent: "paper-plane",
  drafts: "pencil",
  archive: "archive",
  trash: "trash",
  junk: "exclamation-triangle",
};

export const PROVIDERS_DOC_LINK = "https://kanmail.io/docs/email-providers";
export const SUPPORT_DOC_LINK = "https://kanmail.io/support";

export const THEME_NAMES = ["default", "default-dark", "default-light"];

export const APPLE_APP_PASSWORD_LINK =
  "https://support.apple.com/en-gb/HT204397";

export const ACCOUNT_ACCENT_COLORS = [
  "#f44336", "#e91e63", "#9c27b0", "#673ab7",
  "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4",
  "#009688", "#4caf50", "#8bc34a", "#cddc39",
  "#ffeb3b", "#ffc107", "#ff9800", "#ff5722",
  "#795548", "#607d8b",
];
