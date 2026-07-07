function getScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function isInView(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const html = document.documentElement;
  if (
    rect.top < 0 ||
    rect.left < 0 ||
    rect.bottom > (window.innerHeight || html.clientHeight) ||
    rect.right > (window.innerWidth || html.clientWidth)
  ) {
    return false;
  }

  // Also check the scroll container, inset by its scroll-padding — elements
  // under a floating header (which scroll-padding clears) aren't visible.
  const parent = getScrollParent(element);
  if (!parent) {
    return true;
  }
  const parentRect = parent.getBoundingClientRect();
  const parentStyle = getComputedStyle(parent);
  const padTop = parseFloat(parentStyle.scrollPaddingTop) || 0;
  const padBottom = parseFloat(parentStyle.scrollPaddingBottom) || 0;
  return (
    rect.top >= parentRect.top + padTop &&
    rect.bottom <= parentRect.bottom - padBottom
  );
}

export function ensureInView(element: HTMLElement, options: ScrollIntoViewOptions) {
  if (!isInView(element)) {
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
