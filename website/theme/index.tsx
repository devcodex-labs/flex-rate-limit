import type { ComponentProps, ReactNode } from "react";
import { usePage } from "@rspress/core/runtime";
import { Layout as OriginalLayout, Link } from "@rspress/core/theme-original";
import "./index.css";

export * from "@rspress/core/theme-original";

type OriginalLayoutProps = ComponentProps<typeof OriginalLayout>;

type FooterLink = {
  text: string;
  href: string;
  external?: boolean;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

const footerContent = {
  en: {
    tagline: "Rate-limit traffic control for Node.js services.",
    columns: [
      {
        title: "Docs",
        links: [
          { text: "Quick Start", href: "/getting-started/quickstart" },
          { text: "API Reference", href: "/reference/api-reference" },
          { text: "Benchmarks", href: "/benchmark" },
        ],
      },
      {
        title: "Guides",
        links: [
          { text: "Storage Backends", href: "/guides/storage" },
          { text: "Algorithm Comparison", href: "/algorithms/comparison" },
          { text: "Allowlist Patterns", href: "/whitelist-ratelimit-config-scenarios" },
        ],
      },
      {
        title: "Ecosystem",
        links: [
          { text: "VextJS", href: "https://vextjs.github.io/vext/", external: true },
          { text: "schema-dsl", href: "https://vextjs.github.io/schema-dsl/", external: true },
          { text: "monSQLize", href: "https://vextjs.github.io/monSQLize/", external: true },
        ],
      },
      {
        title: "Project",
        links: [
          { text: "Repository", href: "https://github.com/vextjs/flex-rate-limit", external: true },
          { text: "GitHub Organization", href: "https://github.com/vextjs", external: true },
          { text: "Changelog", href: "https://github.com/vextjs/flex-rate-limit/blob/main/CHANGELOG.md", external: true },
        ],
      },
    ],
  },
  zh: {
    tagline: "面向 Node.js 服务的限流流量控制工具。",
    columns: [
      {
        title: "文档",
        links: [
          { text: "快速开始", href: "/getting-started/quickstart" },
          { text: "API 参考", href: "/reference/api-reference" },
          { text: "性能基准", href: "/benchmark" },
        ],
      },
      {
        title: "指南",
        links: [
          { text: "存储后端", href: "/guides/storage" },
          { text: "算法对比", href: "/algorithms/comparison" },
          { text: "白名单场景", href: "/whitelist-ratelimit-config-scenarios" },
        ],
      },
      {
        title: "生态",
        links: [
          { text: "VextJS", href: "https://vextjs.github.io/vext/", external: true },
          { text: "schema-dsl", href: "https://vextjs.github.io/schema-dsl/", external: true },
          { text: "monSQLize", href: "https://vextjs.github.io/monSQLize/", external: true },
        ],
      },
      {
        title: "项目",
        links: [
          { text: "代码仓库", href: "https://github.com/vextjs/flex-rate-limit", external: true },
          { text: "GitHub 组织", href: "https://github.com/vextjs", external: true },
          { text: "更新日志", href: "https://github.com/vextjs/flex-rate-limit/blob/main/CHANGELOG.md", external: true },
        ],
      },
    ],
  },
} satisfies Record<"en" | "zh", { tagline: string; columns: FooterColumn[] }>;

function localizePath(href: string, lang: "en" | "zh") {
  if (lang === "en") {
    return href;
  }

  return href === "/" ? "/zh/" : `/zh${href}`;
}

function FooterAnchor({ link, lang }: { link: FooterLink; lang: "en" | "zh" }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer">
        {link.text}
      </a>
    );
  }

  return <Link href={localizePath(link.href, lang)}>{link.text}</Link>;
}

function FlexRateLimitFooter() {
  const { page } = usePage();
  const lang = page.lang === "zh" ? "zh" : "en";
  const content = footerContent[lang];

  return (
    <footer className="frl-site-footer" aria-label="flex-rate-limit site links">
      <div className="frl-site-footer__inner">
        <div className="frl-site-footer__brand">
          <strong>flex-rate-limit</strong>
          <span>{content.tagline}</span>
          <span>Apache-2.0</span>
        </div>
        <div className="frl-site-footer__grid">
          {content.columns.map((column) => (
            <div className="frl-site-footer__column" key={column.title}>
              <h2>{column.title}</h2>
              {column.links.map((link) => (
                <FooterAnchor link={link} lang={lang} key={`${column.title}-${link.text}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

function LayoutBottom({ existingBottom }: { existingBottom?: ReactNode }) {
  return (
    <>
      <FlexRateLimitFooter />
      {existingBottom}
    </>
  );
}

export function Layout(props: OriginalLayoutProps) {
  return <OriginalLayout {...props} bottom={<LayoutBottom existingBottom={props.bottom} />} />;
}
