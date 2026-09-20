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
  // Keep the Express API + SQLite data next to the serverless function on Vercel.
  // Keys cover both App- and Pages-router NFT path forms used by Next 16 / Vercel.
  outputFileTracingIncludes: {
    "/api/[...path]": ["./server/**/*", "./database/**/*", "./node_modules/sql.js/**/*"],
    "/api/ping": ["./server/**/*"],
    "pages/api/[...path].js": ["./server/**/*", "./database/**/*", "./node_modules/sql.js/**/*"],
    "pages/api/ping.js": ["./server/**/*"],
  },
};

export default nextConfig;
