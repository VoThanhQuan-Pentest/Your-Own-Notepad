import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "vite";

const outputDirectory = resolve(".test-dist");

await build({
  logLevel: "error",
  build: {
    emptyOutDir: true,
    outDir: outputDirectory,
    ssr: "src/tests/validation.test.ts",
    rollupOptions: {
      output: {
        entryFileNames: "validation.test.mjs",
      },
    },
  },
});

await import(`${pathToFileURL(resolve(outputDirectory, "validation.test.mjs")).href}?run=${Date.now()}`);
