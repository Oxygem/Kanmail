import { AccountSettings, ConnectionSettings } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { ACCOUNT_ACCENT_COLORS } from "../constants.ts";
import { redactAddresses } from "./analytics.ts";

interface AccountEventOptions {
  accountType?: string;
  provider?: string;
  email?: string;
  imapSettings?: ConnectionSettings;
  smtpSettings?: ConnectionSettings;
  error?: any;
}

export function getEmailDomain(address: string): string {
  const bits = (address || "").split("@");
  return bits.length > 1 ? bits[bits.length - 1].toLowerCase() : "";
}

// Everything an account event needs to be worth reading, without identifying
// anybody: the provider and domain separate "one user's account is broken" from
// "every account on this Workspace/365 domain is", and the hosts say which
// autoconfigure result got them there. Setup problems are only ever reported by
// the users who hit them, so whatever isn't in the event is unknowable.
export function getAccountEventProps(options: AccountEventOptions = {}): Record<string, any> {
  const { accountType, provider, email, imapSettings, smtpSettings, error } = options;
  const props: Record<string, any> = {};

  if (accountType) {
    props.accountType = accountType;
  }

  const oauthProvider = provider
    || imapSettings?.oauthProvider
    || smtpSettings?.oauthProvider;
  if (oauthProvider) {
    props.provider = oauthProvider;
  }

  const domain = getEmailDomain(
    email || imapSettings?.username || smtpSettings?.username || "",
  );
  if (domain) {
    props.domain = domain;
  }

  if (imapSettings?.host) {
    props.imapHost = imapSettings.host;
    props.imapPort = imapSettings.port;
  }
  if (smtpSettings?.host) {
    props.smtpHost = smtpSettings.host;
    props.smtpPort = smtpSettings.port;
  }

  if (error) {
    props.error = redactAddresses(
      typeof error === "string" ? error : error.message || String(error),
    );
  }

  return props;
}

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
