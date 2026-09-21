/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  // Keep tooling rooted in this package (avoids watching C:\ on Windows).
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  images: { unoptimized: true },
  trailingSlash: false,
  reactStrictMode: true,
  typescript: {
    // Old desk is mostly JSX; leftover rewrite TS must not block Vercel.
    ignoreBuildErrors: true,
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
  webpack: (config) => {
    config.watchOptions = {
      ...(config.watchOptions || {}),
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/database/**',
        '**/server/data/**',
        '**/server/uploads/**',
        '**/server/tmp/**',
        'C:/pagefile.sys',
        'C:/hiberfil.sys',
        'C:/DumpStack.log.tmp',
        'C:/System Volume Information/**',
      ],
    };
    return config;
  },
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
