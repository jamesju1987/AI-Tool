import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/go/", "/api/", "/search", "/zh/search"] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
