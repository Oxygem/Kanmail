import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

// https://vitejs.dev/config/
// https://www.npmjs.com/package/@vitejs/plugin-react
export default defineConfig({
    // wails3 dev proxies to the vite dev server over IPv4 only (its dialer
    // forces tcp4 for localhost), so bind explicitly to 127.0.0.1 — vite's
    // default "localhost" resolves to ::1 first on modern macOS and leaves
    // the IPv4 socket closed.
    server: {
        host: "127.0.0.1",
    },
    plugins: [
        react({
            babel: {
                plugins: [
                    ["@babel/plugin-proposal-decorators", { legacy: true }],
                    [
                        "@babel/plugin-proposal-class-properties",
                        { loose: true },
                    ],
                ],
            },
        }),
        checker({
            typescript: true,
        }),
    ],
    build: {
        rollupOptions: {
            input: {
                index: fileURLToPath(new URL("./index.html", import.meta.url)),
            },
        }
    }
});
