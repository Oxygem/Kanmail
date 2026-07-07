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
    // Include extra (e.g. accountName/folderName) in the dedup key so the same
    // message on different accounts isn't collapsed into a single report.
    const key = `${type}:${message}:${extra ? JSON.stringify(extra) : ""}`;
    if (recentErrors.has(key)) return;
    recentErrors.add(key);
    setTimeout(() => recentErrors.delete(key), 60_000);

    await trackEvent("$exception", {
        $exception_type: type,
        $exception_message: message,
        $exception_stack_trace_raw: stack || "",
        $exception_source: "frontend",
        ...extra,
    });
}

// Track an error caught in a .catch/try-catch that would otherwise be swallowed.
// Pulls the isNetwork/accountName/folderName metadata off the wrapped backend
// error so downstream can distinguish network failures rather than dropping them.
export function trackCaughtError(action: string, e: any): void {
    trackError(action, e?.message ?? String(e), e?.stack, {
        isNetwork: Boolean(e?.cause?.isNetwork),
        accountName: e?.cause?.accountName,
        folderName: e?.cause?.folderName,
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
