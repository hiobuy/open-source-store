import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/forgotPassword",
        destination: "/forgot-password",
        permanent: true,
      },
      {
        source: "/estimationDetails",
        destination: "/estimation-details",
        permanent: true,
      },
      {
        source: "/freightEstimation",
        destination: "/freight-estimation",
        permanent: true,
      },
      {
        source: "/help_center/info",
        destination: "/help-center/info",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
