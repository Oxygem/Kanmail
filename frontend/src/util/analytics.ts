import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";

interface params {
    [_: string]: any
}

const recentErrors = new Set<string>();

export async function trackError(
    type: string,
    message: string,
    stack?: string,
    extra?: params,
): Promise<void> {
    // Include extra (e.g. accountID/folderName) in the dedup key so the same
    // message on different accounts isn't collapsed into a single report.
    const key = `${type}:${message}:${extra ? JSON.stringify(extra) : ""}`;
    if (recentErrors.has(key)) return;
    recentErrors.add(key);
    setTimeout(() => recentErrors.delete(key), 60_000);

    await trackEvent("$exception", {
        $exception_list: [{
            type,
            value: message,
            mechanism: { handled: true, synthetic: false },
        }],
        $exception_stack_trace_raw: stack || "",
        $exception_source: "frontend",
        ...extra,
    });
}

export async function trackEvent(eventName: string, properties: params = {}): Promise<void> {
    console.debug("[analytics] sending event", eventName, properties);

    try {
        await AppService.TrackAnalytics(eventName, {
            ...getBaseParams(),
            ...properties,
        });
    } catch (e) {
        // Don't show in the UI as doesn't impact user, we don't care if lossy
        console.error("[analytics] failed to send event", e);
    }
}

function getBaseParams(): params {
    return {
        userAgent: navigator.userAgent,
        screenHeight: window.screen.height,
        screenWidth: window.screen.width,
    }
}
