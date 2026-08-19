import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      // `declare global { namespace Express { ... } }` is the standard way
      // to augment Express's Request type — not the module-namespace
      // anti-pattern this rule otherwise (correctly) warns about.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
    },
  },
  prettier
);
