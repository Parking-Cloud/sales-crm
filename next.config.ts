import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Import: files up to 5 MB, and the rows read from them for the preview.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
