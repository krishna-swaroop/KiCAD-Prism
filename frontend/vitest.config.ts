import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        // Has to clear the Testing Library budget in `src/test/setup.ts`, with
        // room for the several sequential `waitFor`s a single test can make.
        // Left at the 5s default, a starved worker would blow the test deadline
        // before `waitFor` could report which condition was still unmet.
        testTimeout: 20_000,
    },
});
