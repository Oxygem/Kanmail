export function getAccountIconName(account) {
  if (account.imap_connection.host === "imap.gmail.com") {
    return "google";
  }

  if (account.imap_connection.host === "imap.mail.me.com") {
    return "apple";
  }

  if (account.imap_connection.host === "imap-mail.outlook.com") {
    return "windows";
  }

  return "envelope";
}
