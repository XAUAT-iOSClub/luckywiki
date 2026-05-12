import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@luckyfishes/markdown-core"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
  redirects: async () => [
    {
      source: "/:lang/:path+/",
      destination: "/:lang/:path+",
      permanent: true,
    },
  ],
};

export default nextConfig;
