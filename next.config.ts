import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Lets the test harness compile into its own directory (NEXT_DIST_DIR=.next-test) so the
  // E2E server can run alongside `npm run dev` without the two fighting over `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
