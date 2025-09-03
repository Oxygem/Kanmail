import _ from "lodash";
import moment from "moment";

import { Address } from "../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";

export function encodeFolderName(name) {
  return encodeURIComponent(name);
}

export function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function lowercaseFirstLetter(string) {
  return string.charAt(0).toLowerCase() + string.slice(1);
}

export function formatDate(date) {
  return moment(date).calendar(null, {
    sameDay: "HH:mm A",
    lastDay: "[Yesterday]",
    lastWeek: "dddd",
    nextWeek: "[Next] dddd,", // should never happen (future)
    sameElse: function (now) {
      if (this.isSame(now, "year")) {
        return "MMM DD";
      }
      return "MMM DD YY";
    },
  });
}

export function formatAddress(address: Address, short = false) {
  if (short) {
    let name = address.email;

    if (address.name) {
      const nameBits = address.name.split(" ");
      if (nameBits[0] === "The") {
        return (name = address.name);
      }
      name = nameBits[0];
    }

    return _.trim(name, ",");
  }

  if (address.name) {
    return `${address.name} (${address.email})`;
  }

  return address.email;
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
