/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  trailingSlash: false,
  reactStrictMode: true,
  typescript: {
    // Old desk is mostly JSX; leftover rewrite TS must not block Vercel.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    "sql.js",
    "bcryptjs",
    "jsonwebtoken",
    "express",
    "cors",
    "amqplib",
    "imapflow",
    "puppeteer-core",
    "docx",
    "html-to-docx",
    "mammoth",
    "adm-zip",
    "cheerio",
    "openai",
  ],
  // Force Express + SQLite + Chrome extension sources into the API lambda.
  outputFileTracingIncludes: {
    "/api/*": [
      "./server/**/*",
      "./database/**/*",
      "./extension/**/*",
      "./node_modules/sql.js/dist/**/*",
      "./node_modules/adm-zip/**/*",
    ],
    "/api/**/*": [
      "./server/**/*",
      "./database/**/*",
      "./extension/**/*",
      "./node_modules/sql.js/dist/**/*",
      "./node_modules/adm-zip/**/*",
    ],
    "/*": ["./server/**/*", "./database/**/*", "./extension/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./server/.env",
      "./server/.env.*",
      "./.env",
      "./.env.*",
      "./server/data/**/*",
      "./server/uploads/**/*",
      "./server/tmp/**/*",
      "./extension/**/*.zip",
      "./extension/fixtures/**/*",
    ],
  },
};

export default nextConfig;
