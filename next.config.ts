import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ['@whiskeysockets/baileys', 'pino', 'qrcode'],
  allowedDevOrigins: [
    '*.trycloudflare.com',
    '*.loca.lt',
    '*.pinggy.io',
    '*.free.pinggy.net',
    'localhost:3010',
    'localhost:3000',
    'localhost:3006',
    '127.0.0.1:3010',
    '127.0.0.1:3000',
    '127.0.0.1:3006',
  ],
  devIndicators: false,
};

export default nextConfig;
