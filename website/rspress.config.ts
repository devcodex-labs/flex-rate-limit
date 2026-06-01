import * as path from "node:path";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";

const DEFAULT_DOCS_BASE = "/flex-rate-limit/";
const DEFAULT_DOCS_SITE_URL = "https://vextjs.github.io/flex-rate-limit";

function normalizeDocsBase(value?: string) {
  const raw = value?.trim() || DEFAULT_DOCS_BASE;
  if (raw === "/") {
    return "/";
  }

  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

const docsBase = normalizeDocsBase(process.env.FLEX_RATE_LIMIT_DOCS_BASE);
const docsSiteUrl = trimTrailingSlash(
  process.env.FLEX_RATE_LIMIT_DOCS_SITE_URL || DEFAULT_DOCS_SITE_URL,
);

export default defineConfig({
  root: path.join(__dirname, "..", "docs"),
  base: docsBase,
  title: "flex-rate-limit",
  icon: "/favicon.svg",
  description:
    "A universal Node.js rate limiting library with multiple algorithms, Memory, Redis, and cache-hub backed storage, and framework-agnostic integration.",
  outDir: path.join(__dirname, "dist"),
  plugins: [
    pluginSitemap({
      siteUrl: docsSiteUrl,
    }),
  ],
  search: {
    codeBlocks: true,
  },
  themeConfig: {
    nav: [
      {
        text: "Guide",
        link: "/getting-started/quickstart",
        activeMatch: "/getting-started/",
      },
      {
        text: "Configuration",
        link: "/guides/config",
        activeMatch: "/guides/",
      },
      {
        text: "Algorithms",
        link: "/algorithms/comparison",
        activeMatch: "/algorithms/",
      },
      {
        text: "API",
        link: "/reference/api-reference",
        activeMatch: "/reference/",
      },
      {
        text: "Benchmark",
        link: "/benchmark",
        activeMatch: "/benchmark",
      },
      {
        text: "v2.2.0",
        items: [
          {
            text: "Changelog",
            link: "https://github.com/vextjs/flex-rate-limit/blob/main/CHANGELOG.md",
          },
          {
            text: "npm",
            link: "https://www.npmjs.com/package/flex-rate-limit",
          },
        ],
      },
    ],
    sidebar: {
      "/getting-started/": [
        {
          text: "Getting Started",
          items: [
            { text: "Quickstart", link: "/getting-started/quickstart" },
          ],
        },
      ],
      "/guides/": [
        {
          text: "Guides",
          items: [
            { text: "Configuration", link: "/guides/config" },
            { text: "Advanced Usage", link: "/guides/advanced" },
            { text: "Storage", link: "/guides/storage" },
            { text: "Business Lock", link: "/guides/business-lock-guide" },
          ],
        },
        {
          text: "Whitelist",
          items: [
            { text: "Config Scenarios", link: "/whitelist-ratelimit-config-scenarios" },
            { text: "Independence", link: "/whitelist-ratelimit-independence" },
            { text: "Dynamic Config", link: "/ip-whitelist-dynamic-config" },
          ],
        },
      ],
      "/algorithms/": [
        {
          text: "Algorithms",
          items: [
            { text: "Comparison", link: "/algorithms/comparison" },
            { text: "Deep Analysis", link: "/algorithms/deep-analysis" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "API Reference", link: "/reference/api-reference" },
          ],
        },
      ],
    },
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/vextjs/flex-rate-limit",
      },
    ],
    footer: {
      message: "Released under the MIT License.",
    },
    lastUpdated: true,
  },
});
