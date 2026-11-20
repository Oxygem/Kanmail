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

// Calendar output is relative to the current day ("Yesterday", etc), so the
// cache is only valid within a single day.
const formatDateCache = new Map<string, string>();
let formatDateCacheDay: string | null = null;

export function formatDate(date) {
  const today = new Date().toDateString();
  if (today !== formatDateCacheDay) {
    formatDateCache.clear();
    formatDateCacheDay = today;
  }

  let formatted = formatDateCache.get(date);
  if (formatted === undefined) {
    formatted = moment(date).calendar(null, {
      sameDay: "HH:mm",
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
    formatDateCache.set(date, formatted);
  }

  return formatted;
}

const SUBJECT_PREFIXES = /^\s*((re|fwd?|aw|sv|antw|wg|tr|rif|vs)(\[\d+\])?\s*:\s*)+/i;

export function stripSubjectPrefixes(subject: string): string {
  return (subject || "").replace(SUBJECT_PREFIXES, "");
}

export function formatTime(date): string {
  return moment(date).format("HH:mm");
}

export function dayKey(date): string {
  return moment(date).format("YYYY-MM-DD");
}

export function formatDay(date): string {
  return moment(date).calendar(null, {
    sameDay: "[Today]",
    lastDay: "[Yesterday]",
    lastWeek: "dddd",
    nextDay: "[Tomorrow]",
    nextWeek: "dddd",
    sameElse: function (now) {
      return this.isSame(now, "year") ? "ddd D MMM" : "D MMM YYYY";
    },
  });
}

export function formatDayTime(date): string {
  if (dayKey(date) === dayKey(new Date())) {
    return formatTime(date);
  }
  return `${formatDay(date)}, ${formatTime(date)}`;
}

// "Tom", "Tom and Priya", "Tom, Priya and Gloria", "Tom, Priya and 3 others"
export function joinNames(names: string[], max = 3): string {
  if (names.length <= 1) {
    return names.join("");
  }
  if (names.length > max) {
    const others = names.length - (max - 1);
    return `${names.slice(0, max - 1).join(", ")} and ${others} others`;
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Absolute date for text that outlives the current session, ie the quote
// header in a reply - unlike formatDate, "Yesterday" won't do.
export function formatLongDate(date): string {
  const parsed = moment(date);
  return parsed.isValid() ? parsed.format("ddd, D MMM YYYY [at] HH:mm") : "";
}

export function formatAddress(address: Address, short = false) {
  // Messages can legitimately have no from/to/cc entries (drafts, malformed
  // headers), leaving from[0] etc. undefined - don't crash the thread render.
  if (!address) {
    return "(unknown)";
  }

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

export function hexToRgb(hex: string): {
  r: number;
  g: number;
  b: number;
} {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex: ${hex}`);
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  };
}
