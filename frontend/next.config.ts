import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to be accessed from other devices on the local network.
  // Run with: npm run dev  (binds to 0.0.0.0 via package.json script)
  // Then open http://<your-local-ip>:3000 on your phone.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "localhost:3001",
        // Allow any local network IP (192.168.x.x, 10.x.x.x, 172.x.x.x)
        /^192\.168\.\d+\.\d+(:\d+)?$/,
        /^10\.\d+\.\d+\.\d+(:\d+)?$/,
        /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/,
      ] as any,
    },
  },
};

export default nextConfig;
