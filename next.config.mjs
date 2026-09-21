/** @type {import('next').NextConfig} */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function gitSha() {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA || '';
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_GIT_SHA: gitSha(),
  },
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
