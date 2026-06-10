import { Address, AccountSettings } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import { formatAddress } from "./string.ts";

export interface AccountAddressOption {
  value: [string, Address];
  label: string;
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
