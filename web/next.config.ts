import path from "node:path";

import type { NextConfig } from "next";

// Local development reads secrets from the repo-root .env (one file for Python and the web app).
// On Vercel, GEMINI_API_KEY comes from the project's environment variables instead.
try {
  process.loadEnvFile(path.join(__dirname, "..", ".env"));
} catch {
  /* no root .env: fine in CI and on Vercel */
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
