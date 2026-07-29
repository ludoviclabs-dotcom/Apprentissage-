import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Root ESLint config. `pnpm lint` runs it over the whole workspace
 * (apps, packages, workers, scripts) so no source directory is silently unlinted.
 */
export default [
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "data/**",
      "source-packs/**",
      "playwright-report/**",
      "test-results/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // TypeScript itself reports undefined identifiers, and the core rule does not
      // understand ambient/DOM/Node types. Recommended by typescript-eslint.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    // Test files and root-level tooling configs live outside the packages'
    // tsconfig `include`, so type-aware linting cannot resolve them. Lint them
    // without the project service.
    files: [
      "**/test/**/*.ts",
      "**/tests/**/*.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
      "*.config.ts"
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: false
      }
    }
  },
  {
    // Plain Node scripts (content assembly helpers) are not TypeScript.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly"
      }
    }
  }
];
