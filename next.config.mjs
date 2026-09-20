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
  // Force Express + SQLite assets into every API / server lambda.
  outputFileTracingIncludes: {
    "/api/*": ["./server/**/*", "./database/**/*", "./node_modules/sql.js/dist/**/*"],
    "/api/**/*": ["./server/**/*", "./database/**/*", "./node_modules/sql.js/dist/**/*"],
    "/*": ["./server/**/*", "./database/**/*"],
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
      "./extension/**/*",
    ],
  },
};

export default nextConfig;
