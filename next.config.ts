import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.HANZIFLOW_E2E === "1" ? ".next-e2e" : ".next",
  devIndicators: false,
  poweredByHeader: false,
  // Server Action arguments can contain passwords. Never print them in dev logs.
  logging: { serverFunctions: false },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self)" },
        ],
      },
    ];
  },
};
export default config;
