import type { NextConfig } from "next";

const config: NextConfig = {
  // Keep the loopback origin intact when Clerk propagates authentication through an internal rewrite.
  skipProxyUrlNormalize: true,
};
export default config;
