import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";
import { FEEDBACK_EMAIL } from "../constants.ts";
import systemStore from "../stores/system.ts";
import { trackEvent } from "./analytics.ts";

/*
    Open a compose window addressed to the developer, prefilled with a visible
    (and editable) footer of version/platform info so replies arrive with the
    context needed to act on them.
*/
export function openFeedbackWindow(eventName: string) {
  const params = new URLSearchParams(window.location.search);
  const debug = [
    `Kanmail v${systemStore.props.currentVersion}`,
    `${params.get("os")} ${params.get("arch")}`,
  ].join(" · ");

  AppService.OpenSendWindow({
    to: [FEEDBACK_EMAIL],
    subject: "Kanmail feedback",
    body: `<p></p><p></p><p>--</p><p>${debug}</p>`,
  });
  trackEvent(eventName);
}
