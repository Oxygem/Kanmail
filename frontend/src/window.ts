import _ from "lodash";

import { AppService } from "../bindings/github.com/oxygem/kanmail/internal/services/index.ts";

export function makeDragElement(element) {
  //   // Note this is based on my original drag code merged into `pywebview`:
  //   // https://github.com/r0x0r/pywebview/blob/master/webview/js/drag.py
  //   // @ts-ignore
  //   if (!window.KANMAIL_FRAMELESS || !element) {
  //     return;
  //   }

  //   var initialX = 0;
  //   var initialY = 0;

  //   function onMouseMove(ev) {
  //     var x = ev.screenX - initialX;
  //     var y = ev.screenY - initialY;
  //     window.pywebview._bridge.call("moveWindow", [x, y], null);
  //   }

  //   function onMouseUp() {
  //     window.removeEventListener("mousemove", onMouseMove);
  //   }

  //   function onMouseDown(ev) {
  //     initialX = ev.clientX;
  //     initialY = ev.clientY;
  //     window.addEventListener("mouseup", onMouseUp);
  //     window.addEventListener("mousemove", onMouseMove);
  //   }

  //   element.addEventListener("mousedown", onMouseDown);
}

export function makeNoDragElement(element) {
  //   if (!window.KANMAIL_FRAMELESS || !element) {
  //     return;
  //   }

  //   element.addEventListener("mousedown", (ev) => ev.stopPropagation());
}

function saveWindowPosition() {
  const windowSettings = {
    // Unused (Python/backend provides these currently)
    left: window.screenX,
    top: window.screenY,
    width: window.innerWidth,
    height: window.innerHeight,
    // Used to cap the width/height to the screen size
    screen_width: window.screen.width,
    screen_height: window.screen.height,
  };
  // post("/api/settings/window", windowSettings);
}

export function createWindowPositionHandlers() {
  // window.addEventListener("resize", _.debounce(saveWindowPosition, 100));
}

function getWindowId() {
  const url = new URL(window.location.href);
  return url.searchParams.get("window_id");
}

export function closeWindow() {
  // get("/window/close", { window_id: getWindowId() });
}

export function resizeWindow(width, height) {
  // get("/window/resize", { window_id: getWindowId(), width, height });
}

export async function openLink(link) {
  await AppService.OpenLink(link);
}

export function openFile(filename) {
  // get("/window/open-link", {
  // url: `file://${filename}`,
  // });
}
