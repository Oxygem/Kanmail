import { AccountSettings } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { ACCOUNT_ACCENT_COLORS } from "../constants.ts";

export function getNextAccentColor(existingAccounts: AccountSettings[]): string {
  const usedColors = new Set(
    existingAccounts
      .map((a) => a.settings.accentColor?.toLowerCase())
      .filter((c) => c && c !== "transparent"),
  );

  for (const color of ACCOUNT_ACCENT_COLORS) {
    if (!usedColors.has(color.toLowerCase())) {
      return color;
    }
  }

  // All colors taken — pick the least used one
  const counts = new Map<string, number>();
  for (const color of ACCOUNT_ACCENT_COLORS) {
    counts.set(color.toLowerCase(), 0);
  }
  for (const a of existingAccounts) {
    const c = a.settings.accentColor?.toLowerCase();
    if (c && counts.has(c)) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  let minCount = Infinity;
  let best = ACCOUNT_ACCENT_COLORS[0];
  for (const color of ACCOUNT_ACCENT_COLORS) {
    const count = counts.get(color.toLowerCase()) || 0;
    if (count < minCount) {
      minCount = count;
      best = color;
    }
  }
  return best;
}

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
