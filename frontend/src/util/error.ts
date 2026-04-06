import { RuntimeError } from "../stores/request.ts";

export function normalizeError(e: Error): RuntimeError {
    try {
        const data = JSON.parse(e.message);
        return {
            action: "error-from-json",
            message: data.message,
            cause: data.cause,
        }
    } catch {
        return {
            action: "error",
            message: e.message,
        };
    }
}
