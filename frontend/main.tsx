import React from "react";
import ReactDOM from "react-dom";

import { EmailsService } from "./bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import ErrorBoundary from "./src/components/ErrorBoundary.tsx";
import showErrorInformation from "./src/components/ErrorInformation.tsx";
import { TheTooltip } from "./src/components/Tooltip.tsx";
import "./src/fonts/fontawesome/css/font-awesome.css";
import "./src/fonts/open-sans/css/open-sans.css";
import settingsStore from "./src/stores/settings.ts";
import systemStore from "./src/stores/system.ts";
import "./src/style.less";
import { setupThemes } from "./src/theme.js";

const bootApp = (
    Component: typeof React.Component,
    rootElement: Element,
    rootProps: object = {},
) => {
    console.log("Booting app", Component, rootElement);

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
                <section>
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

const bootSendApp = async (
    appContainer: Element,
    urlParams: URLSearchParams,
) => {
    const [
        { default: SendApp },
        { safeDocumentFromHtml },
        { formatAddress },
    ] = await Promise.all([
        import("./src/components/send/SendApp.tsx"),
        import("./src/util/html.ts"),
        import("./src/util/string.ts"),
    ]);

    if (!urlParams.get("mode")) {
        bootApp(SendApp, appContainer);
        return;
    }

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
    }).catch(() => {
        bootApp(SendApp, appContainer, {
            messageContent: "failed to load reply to email",
        })
    })
}

const main = () => {
    const appContainer = document.querySelector("[data-app-root]")!;

    const urlParams = new URLSearchParams(window.location.search);
    const app = urlParams.get("app");

    switch (app) {
        case "emails":
            import("./src/components/emails/EmailsApp.tsx").then(
                ({ default: EmailsApp }) => bootApp(EmailsApp, appContainer),
            );
            break;
        case "settings":
            import("./src/components/settings/SettingsApp.tsx").then(
                ({ default: SettingsApp }) => bootApp(SettingsApp, appContainer),
            );
            break;
        case "license":
            import("./src/components/license/LicenseApp.tsx").then(
                ({ default: LicenseApp }) => bootApp(LicenseApp, appContainer),
            );
            break;
        case "meta":
            import("./src/components/meta/MetaApp.tsx").then(
                ({ default: MetaApp }) => bootApp(MetaApp, appContainer),
            );
            break;
        case "debug":
            import("./src/components/debug/DebugApp.tsx").then(
                ({ default: DebugApp }) =>
                    bootApp(DebugApp, appContainer, {
                        accountName: urlParams.get("accountName")!,
                        folderName: urlParams.get("folderName")!,
                        uid: urlParams.get("uid")!,
                    }),
            );
            break;
        case "send":
            bootSendApp(appContainer, urlParams);
            break;
        default:
            console.warn(`unknown app: ${app}`);
    }
}

main();
