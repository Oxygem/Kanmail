import _ from "lodash";

export function documentFromHtml(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

export function popElementFromDocument(doc, selector) {
  const element = doc.querySelector(selector);
  if (!element) {
    return;
  }
  element.parentNode.removeChild(element);
  return element;
}

export function cleanHtml(html, returnElement = false) {
  const tempDocument = documentFromHtml(html);

  // Strip crappy tags
  _.each(
    tempDocument.body.querySelectorAll("link,meta,style,title,script"),
    (element) => {
      element.parentNode.removeChild(element);
    }
  );

  // Remove image src attributes to stop them loading immediately
  _.each(tempDocument.body.querySelectorAll("img,image"), (img) => {
    // Attached images are OK!
    if (_.startsWith(img.src, "cid:")) {
      return;
    }

    // Swap src for original-src, remove any srcset
    img.setAttribute("original-src", img.src);
    img.setAttribute("src", "about:blank");
    img.removeAttribute("srcset");
  });

  // Remove any background images (currently cannot be restored!)
  _.each(tempDocument.body.querySelectorAll("*[background]"), (element) => {
    const background = element.getAttribute("background");

    if (_.startsWith(background, "http")) {
      element.removeAttribute("background");
      element.setAttribute("original-background", background);
    }
  });

  _.each(tempDocument.body.querySelectorAll("*[style]"), (element) => {
    const style = element.getAttribute("style");

    if (_.includes(style, "background-image")) {
      element.removeAttribute("style");
      // element.style.backgroundImage = 'about:blank';
    }
  });

  if (returnElement) {
    return tempDocument.body;
  }
  return tempDocument.body.innerHTML;
}
