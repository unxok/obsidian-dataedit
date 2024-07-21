import { UserConfig, defineConfig } from "vite";
import path from "path";
import builtins from "builtin-modules";
// import react from "@vitejs/plugin-react";
import solid from "vite-plugin-solid";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(async ({ mode }) => {
  const { resolve } = path;
  const prod = mode === "production";

  return {
    plugins: [
      //react(),
      solid(),
    ],
    resolve: {
      alias: {
        "lucide-solid/icons": fileURLToPath(
          new URL(
            "./node_modules/lucide-solid/dist/source/icons",
            import.meta.url,
          ),
        ),
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      lib: {
        entry: resolve(__dirname, "src/main.tsx"),
        name: "main",
        fileName: () => "main.js",
        formats: ["cjs"],
      },
      minify: prod,
      sourcemap: prod ? false : "inline",
      cssCodeSplit: false,
      emptyOutDir: false,
      outDir: "",
      rollupOptions: {
        input: {
          main: resolve(__dirname, "src/main.tsx"),
        },
        output: {
          entryFileNames: "main.js",
          assetFileNames: "styles.css",
        },
        external: [
          "obsidian",
          "electron",
          "@codemirror/autocomplete",
          "@codemirror/collab",
          "@codemirror/commands",
          "@codemirror/language",
          "@codemirror/lint",
          "@codemirror/search",
          "@codemirror/state",
          "@codemirror/view",
          "@lezer/common",
          "@lezer/highlight",
          "@lezer/lr",
          ...builtins,
        ],
      },
    },
  } as UserConfig;
});
