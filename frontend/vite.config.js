import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

// https://vitejs.dev/config/
// https://www.npmjs.com/package/@vitejs/plugin-react
export default defineConfig({
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
                app: fileURLToPath(new URL("./app.html", import.meta.url)),
            },
        }
    }
});
