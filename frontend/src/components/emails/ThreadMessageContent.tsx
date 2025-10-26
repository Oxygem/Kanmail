import _ from "lodash";
import React from "react";

import { EmailsService } from "../../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { BodyPart } from "../../../bindings/github.com/oxygem/kanmail/internal/types/index.ts";
import keyboard from "../../keyboard.ts";
import { documentFromHtml } from "../../util/html.js";
import { openLink } from "../../window.ts";

interface IThreadMessageContentProps {
  body: string;
  parts: BodyPart[];
  folderName: string;
  accountName: string;
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

  componentDidMount() {
    this.postRender()
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
    // this.frameElement!.style.height = "auto";
    // let height = this.frameElement!.contentWindow!.document.documentElement.scrollHeight;
    let height = this.frameElement!.contentWindow!.document.body.scrollHeight;
    // console.log("SETHEIGHT", height, this.frameElement!.contentWindow!.document.body.scrollHeight)
    // Now that we've modified, set the height
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
    _.each(tempDocument.body.querySelectorAll("*[background]"), (element) => {
      const background = element.getAttribute("background");
      if (background && _.includes(background, "://")) {
        element.setAttribute("original-background", background);
        element.removeAttribute("background");
      }
    });

    // Remove any inline style background
    _.each(tempDocument.body.querySelectorAll("*[style]"), (element) => {
      const style = element.getAttribute("style");
      if (style && _.includes(style, "background") && _.includes(style, "://")) {
        element.setAttribute("original-style", style);
        // Replacing "background" allows us to prevent the background without impacting other styles
        element.setAttribute("style", style.replaceAll("background", "bgremovedbykanmail"));
      }
    });

    return tempDocument.body;
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

    // Replace blockquotes with show/hide buttons
    _.each(doc.querySelectorAll("blockquote"), (blockquote) => {
      const showButton = document.createElement("button");
      showButton.textContent = "Show quote";

      showButton.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();

        if (blockquote.style.display == "none") {
          blockquote.style.display = "block";
          showButton.textContent = "Hide quote";
        } else {
          blockquote.style.display = "none";
          showButton.textContent = "Show quote";
        }

        this.setFrameHeight();
      });

      // Hide the quote
      blockquote.style.display = "none";

      // Insert the button before the blockquote
      blockquote.parentNode!.insertBefore(showButton, blockquote);
    });

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
          EmailsService.GetAccountFolderEmailsContentParts(this.props.accountName, this.props.folderName, {
            [this.props.uid]: matchingPart,
          }).then(r => {
            img.setAttribute("src", `data:${matchingPart.type};base64,${r[this.props.uid].data}`);
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
      // Handle color scheme + post process on doc load
      this.frameElement.addEventListener("load", () => {
        const window = this.frameElement!.contentWindow!;

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
      });

      const doc = this.doc;

      const s = document.createElement("script");
      s.src = "/iframe/darkreader.min.js";
      doc.appendChild(s);

      const l = document.createElement("link");
      l.rel = "stylesheet"
      l.type = "text/css"
      l.href = "/iframe/inject.css";
      doc.appendChild(l)

      this.frameElement.srcdoc = doc.innerHTML;
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
      return <iframe ref={el => this.frameElement = el} />;
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
