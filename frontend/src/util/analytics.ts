import { AppService } from "../../bindings/github.com/oxygem/kanmail/internal/services/index.ts";

interface params {
    [_: string]: any
}

export async function trackEvent(eventName: string, properties: params = {}): Promise<void> {
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
