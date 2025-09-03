import * as Sentry from "@sentry/react";
import React from "react";
import ReactDOM from "react-dom";

import ErrorBoundary from "./components/ErrorBoundary.tsx";
import showErrorInformation from "./components/ErrorInformation.tsx";
import { TheTooltip } from "./components/Tooltip.tsx";
import "./fonts/fontawesome/css/font-awesome.css";
import "./fonts/open-sans/css/open-sans.css";
import settingsStore from "./stores/settings.ts";
import systemStore from "./stores/system.ts";
import "./style.less";
import { setupThemes } from "./theme.js";

// Bootstrap Sentry error logging if we're not in debug (dev) mode
// if (window.KANMAIL_DEBUG && !window.KANMAIL_DEBUG_SENTRY) {
//   console.debug("Not enabling Sentry error logging in debug mode...");
// } else if (window.KANMAIL_DISABLE_ERROR_LOGGING) {
//   console.debug("Not enabling Sentry error logging per user settings");
// } else {
//   Sentry.init({
//     dsn: window.KANMAIL_SENTRY_DSN,
//     release: `kanmail-app@${window.KANMAIL_VERSION}`,
//     beforeSend(event, hint) {
//       const error = hint.originalException;
//       // Ignore "expected" network errors (logged serverside) and critical request nonce errors
//       if (
//         error &&
//         (error.isNetworkResponseFailure || error.isCriticalRequestNonceFailure)
//       ) {
//         return null;
//       }
//       // Ignore errors that were captured (and thus reported) by the server
//       if (error && error.data && error.data.errorName) {
//         return null;
//       }
//       return event;
//     },
//   });
//   Sentry.setUser({ id: window.KANMAIL_DEVICE_ID });
// }

const bootApp = (
  Component: typeof React.Component,
  rootElement: Element,
  rootProps: object = {},
) => {
  console.log("Booting app", Component, rootElement);

  // document.body.removeChild(document.getElementById("no-app"));

  const classNames: string[] = [];
  // const classNames = [window.KANMAIL_PLATFORM];
  // if (window.KANMAIL_FRAMELESS) {
  classNames.push("frameless");
  // }

  // Load the settings *then* bootstrap the app into the DOM
  Promise.all([
    settingsStore.getSettings(),
    systemStore.checkCachedLicense(), // don't need it here, but want it populated
  ]).then(([settings]) => {
    setupThemes(settings);

    console.debug("Settings loaded, bootstrapping app to DOM...");

    const noApp = document.getElementById("no-app");
    noApp!.parentNode!.removeChild(noApp!);

    ReactDOM.render(
      // <Sentry.ErrorBoundary fallback={showErrorInformation}>
      <ErrorBoundary>
        <section className={classNames.join(" ")}>
          <TheTooltip />
          <Component {...rootProps} />
        </section>,
      </ErrorBoundary>,
      rootElement,
    );
  });
};
export default bootApp;
