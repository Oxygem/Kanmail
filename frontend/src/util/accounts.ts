import { AccountSettings } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";

export function getAccountIconName(account: AccountSettings): string {
  if (!account) {
    return "envelope";
  }

  if (account.imapSettings.host === "imap.gmail.com") {
    return "google";
  }

  if (account.imapSettings.host === "imap.mail.me.com") {
    return "apple";
  }

  if (account.imapSettings.host === "imap-mail.outlook.com") {
    return "windows";
  }

  return "envelope";
}
