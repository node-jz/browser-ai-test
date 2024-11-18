import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
  },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/public/**",
      "**/dist/**",
      "**/.svelte-kit/**",
      "**/build/**",
      ".husky",
      ".vscode",
      "**/node_modules/**",
    ],
  },
];
