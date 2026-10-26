import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" }, // the page-styles builder previews the site in a frame
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }, {
      // every page may only be framed by the site itself (the page-styles preview)
      source: "/((?!brand/).*)",
      headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
    }, {
      // uploaded logo and icon: nothing inside an uploaded SVG can run
      source: "/brand/:path*",
      headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox; frame-ancestors 'self'" }],
    }];
  },
};

export default nextConfig;
