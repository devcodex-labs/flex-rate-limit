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

type LocalizedLink = {
  en: string;
  zh: string;
  link: string;
  activeMatch?: string;
};

type LocalizedMenu = {
  en: string;
  zh: string;
  items: LocalizedLink[];
};

type LocalizedNavItem = LocalizedLink | LocalizedMenu;

type SidebarGroup = {
  en: string;
  zh: string;
  items: LocalizedLink[];
};

const navSource: LocalizedNavItem[] = [
  {
    en: "Guide",
    zh: "指南",
    link: "/getting-started/quickstart",
    activeMatch: "/getting-started/",
  },
  {
    en: "Configuration",
    zh: "配置",
    link: "/guides/config",
    activeMatch: "/guides/",
  },
  {
    en: "Algorithms",
    zh: "算法",
    link: "/algorithms/comparison",
    activeMatch: "/algorithms/",
  },
  {
    en: "Allowlist",
    zh: "白名单",
    link: "/whitelist-ratelimit-config-scenarios",
    activeMatch: "/whitelist-",
  },
  {
    en: "API",
    zh: "API",
    link: "/reference/api-reference",
    activeMatch: "/reference/",
  },
  {
    en: "Benchmark",
    zh: "性能基准",
    link: "/benchmark",
    activeMatch: "/benchmark",
  },
  {
    en: "v2.2.4",
    zh: "v2.2.4",
    items: [
      {
        en: "Changelog",
        zh: "更新日志",
        link: "https://github.com/vextjs/flex-rate-limit/blob/main/CHANGELOG.md",
      },
      {
        en: "npm",
        zh: "npm",
        link: "https://www.npmjs.com/package/flex-rate-limit",
      },
      {
        en: "GitHub Organization",
        zh: "GitHub 组织",
        link: "https://github.com/vextjs",
      },
    ],
  },
];

const sidebarSource: SidebarGroup[] = [
  {
    en: "Getting Started",
    zh: "快速入门",
    items: [
      { en: "Home", zh: "首页", link: "/" },
      { en: "Quick Start", zh: "快速开始", link: "/getting-started/quickstart" },
      { en: "Benchmark", zh: "性能基准", link: "/benchmark" },
    ],
  },
  {
    en: "Guides",
    zh: "使用指南",
    items: [
      { en: "Configuration", zh: "配置详解", link: "/guides/config" },
      { en: "Advanced Usage", zh: "高级用法", link: "/guides/advanced" },
      { en: "Storage", zh: "存储后端", link: "/guides/storage" },
      { en: "Business Lock", zh: "业务锁指南", link: "/guides/business-lock-guide" },
    ],
  },
  {
    en: "Algorithms",
    zh: "算法专题",
    items: [
      { en: "Comparison", zh: "算法对比", link: "/algorithms/comparison" },
      { en: "Deep Analysis", zh: "算法深度分析", link: "/algorithms/deep-analysis" },
    ],
  },
  {
    en: "Allowlist",
    zh: "白名单专题",
    items: [
      {
        en: "Configuration Scenarios",
        zh: "配置场景",
        link: "/whitelist-ratelimit-config-scenarios",
      },
      {
        en: "Allowlist Independence",
        zh: "白名单与限流独立性",
        link: "/whitelist-ratelimit-independence",
      },
      {
        en: "Dynamic IP Allowlist",
        zh: "IP 白名单动态配置",
        link: "/ip-whitelist-dynamic-config",
      },
    ],
  },
  {
    en: "Reference",
    zh: "参考",
    items: [
      { en: "API Reference", zh: "API 参考", link: "/reference/api-reference" },
    ],
  },
];

const isExternalLink = (link: string) => /^https?:\/\//.test(link);

function localizeLink(link: string, language: "en" | "zh") {
  if (language === "en" || isExternalLink(link)) {
    return link;
  }

  return link === "/" ? "/zh/" : `/zh${link}`;
}

function isMenu(item: LocalizedNavItem): item is LocalizedMenu {
  return "items" in item;
}

function createNav(language: "en" | "zh") {
  return navSource.map((item) => {
    if (isMenu(item)) {
      return {
        text: item[language],
        items: item.items.map((child) => ({
          text: child[language],
          link: localizeLink(child.link, language),
        })),
      };
    }

    return {
      text: item[language],
      link: localizeLink(item.link, language),
      activeMatch: item.activeMatch ? localizeLink(item.activeMatch, language) : undefined,
    };
  });
}

function createSidebar(language: "en" | "zh") {
  return sidebarSource.map((group) => ({
    text: group[language],
    items: group.items.map((item) => ({
      text: item[language],
      link: localizeLink(item.link, language),
    })),
  }));
}

const englishNav = createNav("en");
const chineseNav = createNav("zh");
const englishSidebar = createSidebar("en");
const chineseSidebar = createSidebar("zh");

export default defineConfig({
  root: path.join(__dirname, "..", "docs"),
  base: docsBase,
  lang: "en",
  title: "flex-rate-limit",
  icon: "/favicon.svg",
  globalStyles: path.join(__dirname, "styles", "rate-limit-console.css"),
  description:
    "A universal Node.js rate limiting library with multiple algorithms, Memory, Redis, and cache-hub backed storage, and framework-agnostic integration.",
  outDir: path.join(__dirname, "dist"),
  locales: [
    {
      lang: "en",
      label: "English",
      title: "flex-rate-limit",
      description:
        "A universal Node.js rate limiting library for Memory, Redis, and cache-hub backed storage.",
    },
    {
      lang: "zh",
      label: "简体中文",
      title: "flex-rate-limit",
      description: "面向 Node.js 的通用限流库，支持 Memory、Redis 与 cache-hub 后端。",
    },
  ],
  plugins: [
    pluginSitemap({
      siteUrl: docsSiteUrl,
    }),
  ],
  search: {
    codeBlocks: true,
  },
  themeConfig: {
    nav: englishNav,
    locales: [
      {
        lang: "en",
        label: "English",
        title: "flex-rate-limit",
        description:
          "A universal Node.js rate limiting library for Memory, Redis, and cache-hub backed storage.",
        nav: englishNav,
        sidebar: {
          "/": englishSidebar,
        },
      },
      {
        lang: "zh",
        label: "简体中文",
        title: "flex-rate-limit",
        description: "面向 Node.js 的通用限流库，支持 Memory、Redis 与 cache-hub 后端。",
        nav: chineseNav,
        sidebar: {
          "/zh/": chineseSidebar,
        },
      },
    ],
    sidebar: {
      "/": englishSidebar,
      "/zh/": chineseSidebar,
    },
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/vextjs/flex-rate-limit",
      },
    ],
    lastUpdated: true,
  },
});
