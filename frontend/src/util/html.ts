import DOMPurify from "dompurify";
import _ from "lodash";

export function documentFromHtml(html): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

export function safeDocumentFromHtml(html): string {
  const tempDocument = documentFromHtml(html);

  // Strip crappy tags: note this *should* be done by the backend already
  _.each(
    tempDocument.body.querySelectorAll("link,meta,style,title,script"),
    (element) => {
      element.parentNode!.removeChild(element);
    }
  );

  const isInlineSource = (value: string) => /^\s*(data|cid):/i.test(value);

  // Swap remote image sources out, same as the message view does - quoting a
  // hostile email into the composer (which lives in the main-origin DOM,
  // where the CSP still allows remote images) must not fetch the trackers
  // the consent UI withheld. Restored by restoreRemoteImages when the email
  // is actually sent. The markers are data-* attributes because the quoted
  // content round-trips through the Squire editor, whose DOMPurify sanitize
  // strips any other unknown attribute (losing the original URLs entirely).
  // The backend cleaner already strips the svg/picture/srcset vectors -
  // handling them here too keeps this safe standalone.
  _.each(tempDocument.body.querySelectorAll("img,image,source,input"), (element) => {
    element.removeAttribute("srcset");
    _.each(["href", "xlink:href"], (attr) => {
      const value = element.getAttribute(attr);
      if (value && !isInlineSource(value)) {
        element.removeAttribute(attr);
      }
    });
    const src = element.getAttribute("src");
    if (!src || isInlineSource(src)) {
      return;
    }
    element.setAttribute("data-original-src", src);
    element.setAttribute("src", "about:blank");
  });
  _.each(tempDocument.body.querySelectorAll("*[background]"), (element) => {
    const background = element.getAttribute("background");
    if (background && !isInlineSource(background)) {
      element.setAttribute("data-original-background", background);
      element.removeAttribute("background");
    }
  });
  // Inline style backgrounds can fetch via url() too - neutralize the
  // property name, keeping the original for the send-time restore
  _.each(tempDocument.body.querySelectorAll("*[style]"), (element) => {
    const style = element.getAttribute("style");
    if (
      style &&
      _.includes(style, "background") &&
      /url\s*\(\s*['"]?\s*(?!data:|cid:)/i.test(style)
    ) {
      element.setAttribute("data-original-style", style);
      element.setAttribute("style", style.replaceAll("background", "bgremovedbykanmail"));
    }
  });

  return tempDocument.body.innerHTML;
}

// Reverses the swaps above at send time, so the recipient still receives the
// quoted images the composer refused to fetch locally.
export function restoreRemoteImages(html: string): string {
  if (!html || html.indexOf("data-original-") === -1) {
    return html;
  }

  const doc = documentFromHtml(html);
  _.each(doc.body.querySelectorAll("*[data-original-src]"), (element) => {
    element.setAttribute("src", element.getAttribute("data-original-src")!);
    element.removeAttribute("data-original-src");
  });
  _.each(doc.body.querySelectorAll("*[data-original-background]"), (element) => {
    element.setAttribute("background", element.getAttribute("data-original-background")!);
    element.removeAttribute("data-original-background");
  });
  _.each(doc.body.querySelectorAll("*[data-original-style]"), (element) => {
    element.setAttribute("style", element.getAttribute("data-original-style")!);
    element.removeAttribute("data-original-style");
  });
  return doc.body.innerHTML;
}

// Strips scripts, event handlers and unsafe URL schemes. Note that
// safeDocumentFromHtml above only removes a handful of elements and leaves
// attributes alone, so it is not a substitute for this.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html || "");
}
