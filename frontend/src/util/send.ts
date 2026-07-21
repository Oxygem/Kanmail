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
      value: [account.name, addr],
      label: formatAddress(addr),
    }));
  }

  const addr = new Address({
    name: "",
    email: account.smtpSettings.username,
  });

  return [{
    value: [account.name, addr],
    label: formatAddress(addr),
  }];
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
