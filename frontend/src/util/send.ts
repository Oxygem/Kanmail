import _ from "lodash";

import { Address, AccountSettings } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { formatAddress } from "./string.ts";

export interface AccountAddressOption {
  value: [string, Address];
  label: string;
}

export interface AddressOption {
  value: Address;
  label: string;
}

// Deterministic accent colour for an account / recipient, derived from a string
// so any account name or email gets a stable, theme-agnostic colour.
export function stringToColor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 58%, 48%)`;
}

export function avatarInitial(value: string): string {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

export function getAccountContactOptions(account: AccountSettings): AccountAddressOption[] {
  if (account.contacts && account.contacts.length > 0) {
    return account.contacts.map(addr => ({
      value: [account.id, addr],
      label: formatAddress(addr),
    }));
  }

  const addr = new Address({
    name: "",
    email: account.smtpSettings.username,
  });

  return [{
    value: [account.id, addr],
    label: formatAddress(addr),
  }];
}

export function toAddressOptions(addresses: Address[]): AddressOption[] {
  return _.map(addresses, address => ({
    value: address,
    label: formatAddress(address),
  }));
}

export interface ReplyMessage {
  from: Address[];
  to: Address[];
  cc: Address[];
  replyTo: Address[];
}

export interface ReplyRecipients {
  to: Address[];
  cc: Address[];
}

const addressKey = (address: Address): string => (address.email || "").trim().toLowerCase();

function getAccountEmails(account?: AccountSettings | null): Set<string> {
  const emails = new Set<string>();
  if (!account) {
    return emails;
  }

  _.each(account.contacts, contact => {
    const key = addressKey(contact);
    if (key) {
      emails.add(key);
    }
  });

  _.each([account.imapSettings?.username, account.smtpSettings?.username], username => {
    const key = (username || "").trim().toLowerCase();
    if (key.includes("@")) {
      emails.add(key);
    }
  });

  return emails;
}

/*
    Recipients for a reply: the sender (Reply-To when set, the From address otherwise).
    Reply all keeps everyone else on the original To/Cc lines, minus our own addresses
    so we never reply to ourselves.
*/
export function buildReplyRecipients(
  message: ReplyMessage,
  isReplyAll: boolean,
  account?: AccountSettings | null,
): ReplyRecipients {
  const seen = new Set<string>();
  const collect = (addresses: Address[], exclude: Set<string>) =>
    _.filter(addresses, address => {
      const key = addressKey(address);
      if (!key || seen.has(key) || exclude.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

  const sender = message.replyTo && message.replyTo.length > 0 ? message.replyTo : message.from;
  // Never exclude the sender, so replying to our own sent mail still has a recipient
  const to = collect(sender, new Set());

  if (!isReplyAll) {
    return { to, cc: [] };
  }

  const ownEmails = getAccountEmails(account);
  return {
    to: to.concat(collect(message.to, ownEmails)),
    cc: collect(message.cc, ownEmails),
  };
}

// Whether reply all would reach anyone a plain reply wouldn't
export function hasReplyAllRecipients(
  message: ReplyMessage,
  account?: AccountSettings | null,
): boolean {
  const reply = buildReplyRecipients(message, false, account);
  const replyAll = buildReplyRecipients(message, true, account);
  return replyAll.to.length + replyAll.cc.length > reply.to.length;
}

export function prependIfNotPresent(prependTo: string, prependString: string): string {
  if (
    prependTo.startsWith(prependString) ||
    prependTo.startsWith(prependString.toLowerCase()) ||
    prependTo.startsWith(prependString.toUpperCase())
  ) {
    return prependTo;
  }
  return `${prependString}: ${prependTo}`;
}
