import _ from "lodash";
import React from "react";

import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { BodyPart } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard from "../../keyboard.ts";
import { documentFromHtml } from "../../util/html.js";
import { openLink } from "../../window.ts";

const OUTLOOK_REPLY_HEADERS = [
  "#appendonsend",
  "#divRplyFwdMsg",
  "div[style*='border-top:solid #E1E1E1']",
  "div[style*='border-top: solid #E1E1E1']",
  "div[style*='border-top:solid #B5C4DF']",
  "div[style*='border-top: solid #B5C4DF']",
].join(",");
const QUOTE_ATTRIBUTION = /(wrote|écrit|schrieb|escribió|scrisse|schreef|skrev|napisał)\s*:?\s*$/i;
const ORIGINAL_MESSAGE = /^-{2,}\s*original message\s*-{2,}/i;
const REPLY_HEADER = /^from:[\s\S]*subject:/i;
const FORWARDED_MESSAGE = /(forwarded message|begin forwarded message)/i;
const MAX_MARKER_TEXT = 1000;
const MAX_ATTRIBUTION_TEXT = 300;

interface IThreadMessageContentProps {
  body: string;
  parts: BodyPart[];
  folderName: string;
  accountID: string;
  uid: number;
  trusted: boolean;
  sender: string;
  showImages: boolean;
  showTrackers: boolean;
  clickShowImages: () => void;
  clickAlwaysShowImages: () => void;
  setTrackerCount: (n: number) => void;
}

interface IThreadMessageContentState {
  hasImages: boolean;
  showImages: boolean;
}

export default class ThreadMessageContent extends React.Component<IThreadMessageContentProps, IThreadMessageContentState> {
  frameElement: HTMLIFrameElement | null;
  htmlElement: HTMLDivElement | null;

  doc: HTMLElement;

  private frameLoadHandler: (() => void) | null = null;
  private iframeWindow: Window | null = null;

  constructor(props: IThreadMessageContentProps) {
    super(props);

    this.doc = this.generateDoc(props.body);

    this.state = {
      hasImages: this.checkDocForImages(),
      showImages: props.showImages,
    };
  }

  componentDidUpdate(prevProps: IThreadMessageContentProps) {
    if (this.props.body !== prevProps.body) {
      this.doc = this.generateDoc(this.props.body);
      const hasImages = this.checkDocForImages();
      if (hasImages != this.state.hasImages) {
        this.setState({ hasImages });
      }
    }
    if (this.props.showImages !== this.state.showImages) {
      this.setState({ showImages: this.props.showImages });
    }
    this.postRender()
  }

  shouldComponentUpdate(nextProps: IThreadMessageContentProps, nextState: IThreadMessageContentState) {
    return nextProps.body !== this.props.body
      || nextProps.trusted !== this.props.trusted
      || nextProps.showImages !== this.props.showImages
      || nextProps.showTrackers !== this.props.showTrackers
      || nextState.hasImages !== this.state.hasImages
      || nextState.showImages !== this.state.showImages;
  }

  componentDidMount() {
    this.postRender()
  }

  componentWillUnmount() {
    this.cleanupFrameListeners();
  }

  private cleanupFrameListeners() {
    if (this.frameLoadHandler && this.frameElement) {
      this.frameElement.removeEventListener("load", this.frameLoadHandler);
    }
    if (this.iframeWindow) {
      this.iframeWindow.removeEventListener("keydown", keyboard.handleKeyboardEvents);
      this.iframeWindow = null;
    }
    this.frameLoadHandler = null;
  }

  checkDocForImages(): boolean {
    const img = _.filter(
      this.doc.querySelectorAll("img"),
      // Exclude external images
      img => img.getAttribute("original-src")!.indexOf("cid:") == -1,
    );
    return img.length > 0 ? true : false;
  }

  setFrameHeight() {
    const frameWindow = this.frameElement?.contentWindow;
    if (!frameWindow) {
      return;
    }

    let height = frameWindow.document.body.scrollHeight;

    if (height === 0) {
      console.warn("Could not get height of HTML iframe")
      height = 500;
      frameWindow.document.body.style.overflow = "auto";
    }

    this.frameElement!.style.height = (height) + 'px';
  }

  // Turn HTML -> document that can be mutated before passed back as HTML for render
  generateDoc(html: string) {
    const tempDocument = documentFromHtml(html);

    // Strip crappy tags: note this *should* be done by the backend already
    _.each(
      tempDocument.body.querySelectorAll("link,meta,style,title,script"),
      (element) => {
        element.parentNode!.removeChild(element);
      }
    );

    // Remove image src attributes to stop them loading immediately
    _.each(tempDocument.body.querySelectorAll("img,image"), (img: HTMLImageElement) => {
      // Swap src for original-src, remove any srcset
      img.setAttribute("original-src", img.src);
      img.setAttribute("src", "about:blank");
      img.removeAttribute("srcset");
    });

    // Remove any background images (by attribute) (currently cannot be restored!)
    // Anything that isn't an inline data:/cid: source counts as remote.
    _.each(tempDocument.body.querySelectorAll("*[background]"), (element) => {
      const background = element.getAttribute("background");
      if (background && !/^\s*(data|cid):/i.test(background)) {
        element.setAttribute("original-background", background);
        element.removeAttribute("background");
      }
    });

    // Remove any inline style background. Any url() that isn't inline
    // data:/cid: counts as remote - a "://" substring check would let
    // protocol-relative URLs through.
    _.each(tempDocument.body.querySelectorAll("*[style]"), (element) => {
      const style = element.getAttribute("style");
      if (
        style &&
        _.includes(style, "background") &&
        /url\s*\(\s*['"]?\s*(?!data:|cid:)/i.test(style)
      ) {
        element.setAttribute("original-style", style);
        // Replacing "background" allows us to prevent the background without impacting other styles
        element.setAttribute("style", style.replaceAll("background", "bgremovedbykanmail"));
      }
    });

    return tempDocument.body;
  }

  // Hide quoted replies behind a toggle. Sanitizing strips class attributes, so
  // beyond blockquotes (with the "On ... wrote:" line before them) the quoted
  // tail of a reply is found by the reply header ids and text clients write:
  // Outlook's "From: ... Subject:" block, "-----Original Message-----" and a
  // dated "On ... wrote:" line with no blockquote after it.
  collapseQuotes(doc: HTMLDocument | HTMLElement) {
    const ownerDocument = doc.ownerDocument || (doc as HTMLDocument);
    const root: Node = doc instanceof HTMLElement ? doc : (doc as HTMLDocument).body;
    if (!root) {
      return;
    }

    const totalText = (root.textContent || "").trim().length;
    let hiddenText = 0;
    const groups: HTMLElement[][] = [];

    // Iframe nodes belong to the frame's realm, so element checks go by nodeType
    const isElement = (node: Node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE;
    const isHidden = (node: Node) => Boolean(
      (isElement(node) ? node : node.parentElement)?.closest("[data-kanmail-quote]"),
    );

    const hide = (nodes: Node[]) => {
      const text = _.sumBy(nodes, node => (node.textContent || "").trim().length);
      const quoteText = _.map(nodes, node => node.textContent || "").join(" ");
      if (totalText - hiddenText - text < 1 || FORWARDED_MESSAGE.test(quoteText)) {
        return;
      }
      hiddenText += text;

      const elements: HTMLElement[] = [];
      _.each(nodes, node => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (!(node.textContent || "").trim()) {
            return;
          }
          const span = ownerDocument.createElement("span");
          node.parentNode!.insertBefore(span, node);
          span.appendChild(node);
          node = span;
        }
        if (isElement(node)) {
          node.setAttribute("data-kanmail-quote", "");
          elements.push(node);
        }
      });
      if (elements.length > 0) {
        groups.push(elements);
      }
    };

    const previousContent = (node: Node): Node | null => {
      let sibling = node.previousSibling;
      while (sibling && (sibling.nodeName === "BR" || !(sibling.textContent || "").trim())) {
        sibling = sibling.previousSibling;
      }
      return sibling;
    };

    const isAttribution = (node: Node | null) => {
      const text = (node?.textContent || "").trim();
      return text.length < MAX_ATTRIBUTION_TEXT && QUOTE_ATTRIBUTION.test(text);
    };

    const findReplyHeader = (): Element | null => {
      const byMarkup = (doc as HTMLElement).querySelector(OUTLOOK_REPLY_HEADERS);
      if (byMarkup) {
        return byMarkup;
      }
      if (FORWARDED_MESSAGE.test(root.textContent || "")) {
        return null;
      }
      return _.find((doc as HTMLElement).querySelectorAll("div, p"), (block) => {
        const text = (block.textContent || "").trim();
        if (text.length > MAX_MARKER_TEXT) {
          return false;
        }
        if (ORIGINAL_MESSAGE.test(text) || REPLY_HEADER.test(text)) {
          return true;
        }
        const next = block.nextElementSibling;
        return isAttribution(block) && /\d/.test(text) && next?.nodeName !== "BLOCKQUOTE";
      }) || null;
    };

    const replyHeader = findReplyHeader();
    if (replyHeader) {
      const nodes: Node[] = [];
      const rule = previousContent(replyHeader) || replyHeader.previousElementSibling;
      if (rule?.nodeName === "HR") {
        nodes.push(rule);
      }
      nodes.push(replyHeader);
      let current: Node = replyHeader;
      while (current !== root && current.parentNode) {
        for (let sibling = current.nextSibling; sibling; sibling = sibling.nextSibling) {
          nodes.push(sibling);
        }
        current = current.parentNode;
      }
      hide(nodes);
    }

    _.each((doc as HTMLElement).querySelectorAll("blockquote"), (quote) => {
      if (isHidden(quote)) {
        return;
      }
      const nodes: Node[] = [quote];
      const attribution = previousContent(quote);
      if (attribution && !isHidden(attribution) && isAttribution(attribution)) {
        nodes.unshift(attribution);
      }
      hide(nodes);
    });

    _.each(groups, (elements) => {
      const toggle = ownerDocument.createElement("button");
      toggle.className = "kanmail-quote-toggle";
      toggle.textContent = "•••";
      toggle.title = "Show quoted text";

      toggle.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();

        const show = elements[0].style.display === "none";
        _.each(elements, element => {
          element.style.display = show ? "" : "none";
        });
        toggle.title = show ? "Hide quoted text" : "Show quoted text";
        this.setFrameHeight();
      });

      _.each(elements, element => {
        element.style.display = "none";
      });
      elements[0].parentNode!.insertBefore(toggle, elements[0]);
    });
  }

  // Insert a live doc/element target using the attributes added in generateDoc
  processDoc(doc: HTMLDocument | HTMLElement) {
    let trackers: number = 0;

    // Make all links open in a new tab
    _.each(doc.querySelectorAll("a"), (link) => {
      // Overwrite the link to tell the server to open the link in the OS
      // external browser.
      const target = link.getAttribute("href");

      // On click fire off a background request to open the link in the
      // OS default browser.
      link.addEventListener("click", (ev) => {
        ev.preventDefault();
        openLink(target);
      });
    });

    this.collapseQuotes(doc);

    // Replace imgs with show/hide buttons
    _.each(doc.querySelectorAll("img"), (img) => {
      const imageURL = img.getAttribute("original-src");
      if (!imageURL) {
        console.error("got image without src element!", img)
        return
      }

      if (_.startsWith(imageURL, "cid:")) {
        const contentID = "<" + imageURL.substring(4) + ">";
        const matchingPart = _.filter(this.props.parts, p => p.contentID == contentID)[0]
        if (matchingPart) {
          EmailsService.GetAccountFolderEmailsContentParts(this.props.accountID, this.props.folderName, {
            [this.props.uid]: matchingPart,
          }).then(r => {
            const data = r[this.props.uid]?.data;
            if (!data) {
              console.warn(`No data for inline image ${contentID} in ${this.props.folderName}/${this.props.uid}`);
              return;
            }
            img.setAttribute("src", `data:${matchingPart.type};base64,${data}`);
            console.log(`data:${matchingPart.type};base64,BLAH`, img)
          })
        }
        return;
      }

      const width = parseInt(img.getAttribute("width")!);
      const height = parseInt(img.getAttribute("height")!);
      const isTracker = width === 0 || width === 1 || height === 0 || height === 1;

      // If we're a tracker and not showing them - count & exit
      if (isTracker && !this.props.showTrackers) {
        console.debug("Ignoring tracker image", img);
        trackers++;
        return
      }

      // If we're not a tracker and we're showing images - set the url. This means clicking the
      // trackers icon merely reveals the buttons to show each tracker, never automatically show
      // tracking pixels.
      if (!isTracker && this.state.showImages) {
        img.src = imageURL;
        return;
      }

      const showButton = document.createElement("button");
      showButton.textContent = isTracker ? "Show tracker" : "Show image";
      const alt = img.getAttribute("alt");
      if (alt) {
        showButton.textContent += ": " + alt;
      }
      showButton.classList.add("show-image-button");

      showButton.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        img.setAttribute("src", imageURL);
        showButton.parentNode!.removeChild(showButton);
      });

      // Insert the button before the image
      img.parentNode!.insertBefore(showButton, img.nextSibling);
    });

    // Replace imgs with show/hide buttons
    _.each(doc.querySelectorAll("*[original-style]"), (element) => {
      const originalStyle = element.getAttribute("original-style");
      if (!originalStyle) {
        return;
      }

      const showButton = document.createElement("button");
      showButton.textContent = "Show background style";
      showButton.classList.add("show-image-button");

      showButton.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        element.setAttribute("style", originalStyle);
        showButton.parentNode!.removeChild(showButton);

        this.setFrameHeight();
      });

      // Insert the button before the element
      element.parentNode!.insertBefore(showButton, element.nextSibling);
    });

    if (trackers > 0) {
      this.props.setTrackerCount(trackers);
    }
  }

  postRender() {
    if (this.htmlElement) {
      this.htmlElement.innerHTML = this.doc.innerHTML;
      this.processDoc(this.htmlElement);
    }

    if (this.frameElement) {
      // Remove previous listeners before adding new ones
      this.cleanupFrameListeners();

      // Handle color scheme + post process on doc load
      this.frameLoadHandler = () => {
        const window = this.frameElement!.contentWindow!;
        this.iframeWindow = window;

        // Proxy keydown events to the main keyboard handler
        window.addEventListener("keydown", keyboard.handleKeyboardEvents);

        // @ts-ignore
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          // @ts-ignore
          window.DarkReader.enable()
        }

        const doc = window.document;

        // @ts-ignore
        if (!window.document.processed) {
          this.processDoc(doc);
        }

        this.setFrameHeight();

        // @ts-ignore
        window.document.processed = true;
      };
      this.frameElement.addEventListener("load", this.frameLoadHandler);

      // CSP blocks any script execution from the email content itself: only
      // our own iframe scripts (darkreader) may run, styles are limited to our
      // own plus inline, and forms/navigation are disabled entirely
      const origin = window.location.origin;
      const csp = [
        "default-src 'none'",
        `script-src ${origin}`,
        `style-src ${origin} 'unsafe-inline'`,
        "img-src data: about: http: https:",
        `font-src ${origin} data: http: https:`,
        `connect-src ${origin}`,
        "form-action 'none'",
        "base-uri 'none'",
      ].join("; ");

      this.frameElement.srcdoc = "<!DOCTYPE html><html><head>"
        + '<meta charset="utf-8">'
        + `<meta http-equiv="Content-Security-Policy" content="${csp}">`
        + '<link rel="stylesheet" type="text/css" href="/iframe/inject.css">'
        + '<script src="/iframe/darkreader.min.js"></script>'
        + `</head><body>${this.doc.innerHTML}</body></html>`;
    }
  }

  renderImagesNotice() {
    if (this.state.hasImages && !this.state.showImages) {
      const showImages = <a onClick={this.props.clickShowImages}>show images</a>;
      const alwaysShowImages = <a onClick={this.props.clickAlwaysShowImages}>always show images from {this.props.sender}</a>;
      return <p className="data-notice">Remote images are not displayed by default: {showImages} or {alwaysShowImages}.</p>;
    }
  }

  renderContainer() {
    if (this.props.trusted) {
      return <div ref={el => this.htmlElement = el} />
    } else {
      // allow-same-origin + allow-scripts are required for our own inject and
      // darkreader scripts and the parent's process/measure access; email
      // content itself can never script (CSP).
      return <iframe
        sandbox="allow-same-origin allow-scripts"
        ref={el => this.frameElement = el}
      />;
    }
  }

  render() {
    return (
      <div className="content">
        {this.renderImagesNotice()}
        {this.renderContainer()}
        <div className="overlay" />
      </div>
    );
  }
}
