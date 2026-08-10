import React from "react";
import ReactDOM from "react-dom";

import { AppService, EmailsService } from "./bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import ErrorBoundary from "./src/components/ErrorBoundary.tsx";
import showErrorInformation from "./src/components/ErrorInformation.tsx";
import { HeaderErrorsHost } from "./src/components/HeaderErrors.tsx";
import { TheTooltip } from "./src/components/Tooltip.tsx";
import "./src/fonts/fontawesome/css/font-awesome.css";
import "./src/fonts/open-sans/css/open-sans.css";
import requestStore, { installGlobalErrorHandlers } from "./src/stores/request.ts";
import settingsStore from "./src/stores/settings.ts";
import systemStore from "./src/stores/system.ts";
import "./src/style.less";
import { setupThemes } from "./src/theme.js";

const renderBootError = (rootElement: Element) => (error: any) => {
    console.error("Boot failed", error);
    requestStore.addError("Boot failed", error, { silent: true });

    const noApp = document.getElementById("no-app");
    if (noApp) {
        noApp.parentNode!.removeChild(noApp);
    }

    ReactDOM.render(
        showErrorInformation({
            error: String(error?.message ?? error),
            componentStack: error?.stack,
        }),
        rootElement,
    );
};

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
                    {/* @ts-ignore */}
                    <HeaderErrorsHost />
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
    }).catch(renderBootError(rootElement));
};

const bootSendApp = async (
    appContainer: Element,
    urlParams: URLSearchParams,
) => {
    const [
        { default: SendApp },
        { buildQuotedContent },
    ] = await Promise.all([
        import("./src/components/send/SendApp.tsx"),
        import("./src/util/send.ts"),
    ]);

    const token = urlParams.get("payload");
    const payload = token ? await AppService.GetSendWindowPayload(token) : null;

    if (!payload?.mode) {
        bootApp(SendApp, appContainer, {
            to: payload?.to || [],
            subject: payload?.subject || "",
            messageContent: payload?.body || "",
        });
        return;
    }

    const completeContent = payload.body;

    const carriedProps = {
        completeContent: completeContent || undefined,
        attachments: payload.attachments || undefined,
        to: payload.to || [],
        subject: payload.subject || undefined,
        mode: payload.mode,
    };

    EmailsService.GetAccountFolderEmailAndContent(
        payload.accountID!,
        payload.folderName!,
        payload.uid!,
    ).then(([email, data]) => {
        // SendApp positions the signature between the reply and the quote
        bootApp(SendApp, appContainer, {
            ...carriedProps,
            message: email,
            quotedContent: completeContent ? "" : buildQuotedContent(email!, data!.data),
        })
    }).catch((e) => {
        // Loading the replied-to email can fail (offline, transient IMAP) but
        // the carried compose content must never be dropped with it
        requestStore.addError("Failed to load reply email", e);
        bootApp(SendApp, appContainer, {
            ...carriedProps,
            messageContent: completeContent ? undefined : "failed to load reply to email",
        })
    })
}

const main = () => {
    installGlobalErrorHandlers();

    const appContainer = document.querySelector("[data-app-root]")!;

    const urlParams = new URLSearchParams(window.location.search);
    const app = urlParams.get("app");

    const bootError = renderBootError(appContainer);

    switch (app) {
        case "emails":
            import("./src/components/emails/EmailsApp.tsx").then(
                ({ default: EmailsApp }) => bootApp(EmailsApp, appContainer),
            ).catch(bootError);
            break;
        case "settings":
            import("./src/components/settings/SettingsApp.tsx").then(
                ({ default: SettingsApp }) => bootApp(SettingsApp, appContainer),
            ).catch(bootError);
            break;
        case "meta":
            import("./src/components/meta/MetaApp.tsx").then(
                ({ default: MetaApp }) => bootApp(MetaApp, appContainer),
            ).catch(bootError);
            break;
        case "debug":
            import("./src/components/debug/DebugApp.tsx").then(
                ({ default: DebugApp }) =>
                    bootApp(DebugApp, appContainer, {
                        accountID: urlParams.get("accountID")!,
                        folderName: urlParams.get("folderName")!,
                        uid: urlParams.get("uid")!,
                    }),
            ).catch(bootError);
            break;
        case "send":
            bootSendApp(appContainer, urlParams).catch(bootError);
            break;
        default:
            console.warn(`unknown app: ${app}`);
    }
}

main();
