import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@luckyfishes/markdown-core"],
  turbopack: {
    root: path.join(process.cwd(), ".."),
  },
};

export default nextConfig;
