import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Block 1a-9: "Oggi" became "Promemoria", "Soggetti" became "Prospect".
  // Old links keep working (temporary redirects: the names may still change).
  async redirects() {
    return [
      { source: "/oggi", destination: "/promemoria", permanent: false },
      { source: "/soggetti", destination: "/prospect", permanent: false },
      { source: "/soggetti/:path*", destination: "/prospect/:path*", permanent: false },
    ];
  },
  experimental: {
    serverActions: {
      // Import: the file is read in the browser; only the rows of the chosen
      // sheets (preview) and the plan (import) are sent.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
