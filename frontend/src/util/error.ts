import { RuntimeError } from "../stores/request.ts";

export function normalizeError(e: Error): RuntimeError {
    // Wails puts the marshalled Go error on the cause of the thrown Error, so
    // any detail it carries (account settings, network/reauth flags) is lost
    // unless it's passed through here
    const cause = (e as any).cause;

    try {
        const data = JSON.parse(e.message);
        return {
            action: "error-from-json",
            message: data.message,
            cause: data.cause || cause,
        }
    } catch {
        return {
            action: "error",
            message: e.message,
            cause: cause,
        };
    }
}
