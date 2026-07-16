import React from "react";
import ReactDOM from "react-dom";

import ErrorBoundary from "./src/components/ErrorBoundary.tsx";
import showErrorInformation from "./src/components/ErrorInformation.tsx";
import { TheTooltip } from "./src/components/Tooltip.tsx";
import "./src/fonts/fontawesome/css/font-awesome.css";
import "./src/fonts/open-sans/css/open-sans.css";
import settingsStore from "./src/stores/settings.ts";
import systemStore from "./src/stores/system.ts";
import "./src/style.less";
import { setupThemes } from "./src/theme.js";

import { EmailsService } from "./bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import DebugApp from "./src/components/debug/DebugApp.tsx";
import EmailsApp from "./src/components/emails/EmailsApp.tsx";
import LicenseApp from "./src/components/license/LicenseApp.tsx";
import MetaApp from "./src/components/meta/MetaApp.tsx";
import SendApp from "./src/components/send/SendApp.tsx";
import SettingsApp from "./src/components/settings/SettingsApp.tsx";
import { safeDocumentFromHtml } from "./src/util/html.ts";
import { formatAddress } from "./src/util/string.ts";

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

    // Settings hydrate synchronously from window.KANMAIL_SETTINGS (defined by
    // the backend-served /kanmail-settings.js script), so getSettings()
    // resolves without IPC before first paint; everything else loads after.
    Promise.all([
        settingsStore.getSettings(),
        systemStore.checkCachedLicense(),
    ]).then(([settings]) => {
        setupThemes(settings);

        console.debug("Settings loaded, bootstrapping app to DOM...");

        const noApp = document.getElementById("no-app");
        noApp!.parentNode!.removeChild(noApp!);

        ReactDOM.render(
            <ErrorBoundary>
                <section className={classNames.join(" ")} >
                    <TheTooltip />
                    < Component {...rootProps} />
                </section>
            </ErrorBoundary>,
            rootElement,
        );

        // Populate the rest of the system state in the background; nothing on
        // the render path depends on it.
        systemStore.checkCurrentVersion();
        systemStore.checkDebug();
        systemStore.getLogFilename();
        systemStore.getExecutableFilename();
    });
};

const main = () => {
    const appContainer = document.querySelector("[data-app-root]")!;

    const urlParams = new URLSearchParams(window.location.search);
    const app = urlParams.get("app");

    switch (app) {
        case "emails":
            bootApp(EmailsApp, appContainer);
            break;
        case "settings":
            bootApp(SettingsApp, appContainer);
            break;
        case "license":
            bootApp(LicenseApp, appContainer);
            break;
        case "meta":
            bootApp(MetaApp, appContainer);
            break;
        case "debug":
            const props = {
                accountName: urlParams.get("accountName")!,
                folderName: urlParams.get("folderName")!,
                uid: urlParams.get("uid")!,
            };
            bootApp(DebugApp, appContainer, props);
            break;
        case "send":
            if (urlParams.get("mode")) {
                EmailsService.GetAccountFolderEmailAndContent(
                    urlParams.get("accountName")!,
                    urlParams.get("folderName")!,
                    parseInt(urlParams.get("uid")!),
                ).then(([email, data]) => {
                    const doc = safeDocumentFromHtml(data!.data);
                    const title = `On ${email!.date} ${formatAddress(email!.from[0])} wrote:`
                    const content = `
    <p></p>
    ${title}:

    <blockquote>${doc}</blockquote>`;

                    bootApp(SendApp, appContainer, {
                        message: email,
                        messageContent: content,
                        mode: urlParams.get("mode") || "reply",
                    })
                    return;
                }).catch(() => {
                    bootApp(SendApp, appContainer, {
                        messageContent: "failed to load reply to email",
                    })
                })
                break;
            }
            bootApp(SendApp, appContainer);
            break;
        default:
            console.warn(`unknown app: ${app}`);
    }
}

main();
