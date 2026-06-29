function isInViewport(element) {
  var rect = element.getBoundingClientRect();
  var html = document.documentElement;
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || html.clientHeight) &&
    rect.right <= (window.innerWidth || html.clientWidth)
  );
}

export function ensureInView(element: HTMLElement, options: ScrollIntoViewOptions) {
  if (!isInViewport(element)) {
    console.log("SCROLL", element, options);
    element.scrollIntoView(options);
  }
}

export function isPointInElement(x: number, y: number, element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function stopEventPropagation(ev) {
  ev.stopPropagation();
}
