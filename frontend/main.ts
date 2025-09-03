import { EmailsService } from "./bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import bootApp from "./src/boot.tsx";
import EmailsApp from "./src/components/emails/EmailsApp.tsx";
import LicenseApp from "./src/components/license/LicenseApp.tsx";
import MetaApp from "./src/components/meta/MetaApp.tsx";
import SendApp from "./src/components/send/SendApp.tsx";
import SettingsApp from "./src/components/settings/SettingsApp.tsx";
import { safeDocumentFromHtml } from "./src/util/html.ts";
import { formatAddress } from "./src/util/string.ts";

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
