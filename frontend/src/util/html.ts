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

  return tempDocument.body.innerHTML;
}
