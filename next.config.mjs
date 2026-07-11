/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate"
          },
          {
            key: "Service-Worker-Allowed",
            value: "/"
          }
        ],
        source: "/sw.js"
      }
    ];
  }
};

export default nextConfig;
