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
      },
      {
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, must-revalidate"
          }
        ],
        source: "/exercise-catalog/manifest.json"
      },
      {
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ],
        source: "/exercise-catalog/exercises.:file.json"
      }
    ];
  }
};

export default nextConfig;
