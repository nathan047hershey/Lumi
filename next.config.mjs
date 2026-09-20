/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  trailingSlash: false,
  reactStrictMode: true,
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
  outputFileTracingIncludes: {
    "/api/[...path]": ["./server/**/*", "./database/**/*"],
    "/api/ping": ["./server/**/*"],
  },
};

export default nextConfig;
