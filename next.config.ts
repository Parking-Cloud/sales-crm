import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Import: the file is read in the browser; only the rows of the chosen
      // sheets (preview) and the plan (import) are sent.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
