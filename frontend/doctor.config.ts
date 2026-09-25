import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {
    // Exclude everything under public/ except ecad-viewer.js, which is
    // maintained code vendored from our ecad-viewer fork.
    files: ["public/!(ecad-viewer.js)", "public/*/**"],
    overrides: [
      {
        // ecad-viewer's generateUUID() uses Math.random for element ids only,
        // never auth material. Fix upstream in the fork if it ever matters;
        // the bundle itself must not be hand-edited.
        files: ["public/ecad-viewer.js"],
        rules: ["react-doctor/insecure-crypto-risk"],
      },
      {
        // Fast Refresh ergonomics only, and the repository already made this
        // call: eslint.config.js turns react-refresh/only-export-components
        // off. Splitting 14 files to satisfy a second scanner would be
        // churn, not a fix. Keep the two configurations agreeing.
        files: ["src/**"],
        rules: ["react-doctor/only-export-components"],
      },
    ],
  },
});
