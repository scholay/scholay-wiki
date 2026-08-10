import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = join(__dirname, "..");
const REPO_ROOT = join(FRONTEND_ROOT, "..");
const EDGE_NGINX = readFileSync(
  join(REPO_ROOT, "nginx", "conf.d", "user.conf"),
  "utf8",
);
const ROOT_NGINX = readFileSync(join(REPO_ROOT, "nginx", "nginx.conf"), "utf8");
const STATIC_SITEMAP_SOURCE = readFileSync(
  join(REPO_ROOT, "backend", "internal", "seo", "content_articles.go"),
  "utf8",
);
const DEV_COMPOSE = readFileSync(join(REPO_ROOT, "docker-compose.yml"), "utf8");
const PROD_COMPOSE = readFileSync(
  join(REPO_ROOT, "docker-compose.prod.yml"),
  "utf8",
);
const NGINX_DOCKERFILE = readFileSync(
  join(REPO_ROOT, "nginx", "Dockerfile"),
  "utf8",
);
const DEPLOY_SCRIPT = readFileSync(
  join(REPO_ROOT, "scripts", "deploy.sh"),
  "utf8",
);

function source(relativePath: string): string {
  return readFileSync(join(FRONTEND_ROOT, relativePath), "utf8");
}

describe("SEO HTTP routing contract", () => {
  it("serves every public indexable route through the same backend HTML path", () => {
    const publicLocation = EDGE_NGINX.match(
      /location ~ \^\/\(paper\|author\|journal[\s\S]*?\n\s*\}/,
    )?.[0];
    expect(publicLocation).toBeTruthy();
    expect(publicLocation).toContain("return 418;");
    expect(publicLocation).not.toContain("$is_crawler");
    expect(publicLocation).not.toContain("frontend_upstream");
    expect(ROOT_NGINX).not.toContain("$is_crawler");

    const catchAll = EDGE_NGINX.match(
      /# 其它未知 HTML[\s\S]*?location \/ \{[\s\S]*?return 418;[\s\S]*?\n\s*\}/,
    )?.[0];
    expect(catchAll).toBeTruthy();
    expect(EDGE_NGINX).toContain(
      'add_header Vary "Accept-Encoding, User-Agent" always;',
    );
  });

  it("keeps every real private/session/token/OAuth route on the SPA with noindex", () => {
    const privateLocation = EDGE_NGINX.match(
      /location ~ \^\/\((admin\|dashboard[\s\S]*?)\)\(\/\|\$\) \{([\s\S]*?)\n\s*\}/,
    );
    expect(privateLocation).toBeTruthy();
    const prefixes = privateLocation?.[1] ?? "";
    const body = privateLocation?.[2] ?? "";

    for (const prefix of [
      "admin",
      "settings",
      "m",
      "library",
      "claw",
      "prism",
      "peer-review",
      "citation-generator",
      "s",
      "i",
      "wechat",
      "github",
      "google",
      "apple",
      "orcid",
      "microsoft",
      "discourse",
    ]) {
      expect(prefixes.split("|")).toContain(prefix);
    }
    expect(body).toContain("proxy_pass http://frontend_upstream;");
    expect(body).toContain(
      'add_header X-Robots-Tag "noindex, nofollow" always;',
    );
  });

  it("does not mobile-redirect Google inspection and auxiliary crawlers", () => {
    const phoneMap = ROOT_NGINX.match(
      /map \$http_user_agent \$is_phone_client \{[\s\S]*?\n\s*\}/,
    )?.[0];
    expect(phoneMap).toMatch(/google-inspectiontool/i);
    expect(phoneMap).toMatch(/googleother/i);

    const deviceSource = source("src/shared/lib/device.ts");
    expect(deviceSource).toMatch(/google-inspectiontool/i);
    expect(deviceSource).toMatch(/googleother/i);
  });

  it("never allows the UA-dependent homepage redirect into a shared cache", () => {
    const homepage = EDGE_NGINX.match(
      /location = \/ \{[\s\S]*?\n\s*\}/,
    )?.[0];
    expect(homepage).toBeTruthy();
    expect(homepage).toContain(
      'add_header Cache-Control "private, no-store, max-age=0" always;',
    );
    expect(homepage).toContain(
      'add_header Vary "Accept-Encoding, User-Agent" always;',
    );
  });

  it("keeps edge-generated redirects relative behind the TLS terminator", () => {
    expect(EDGE_NGINX).toMatch(
      /server\s*\{[\s\S]*?server_name _;[\s\S]*?absolute_redirect off;/,
    );
    expect(EDGE_NGINX).toContain(
      "location = /chat { return 301 /claw$is_args$args; }",
    );
  });

  it("rebuilds edge routing when nginx config changes", () => {
    for (const compose of [DEV_COMPOSE, PROD_COMPOSE]) {
      const service = compose.match(/\n  nginx:\n([\s\S]*?)(?=\n  [a-zA-Z0-9_-]+:|\nvolumes:)/)?.[1];
      expect(service).toBeTruthy();
      expect(service).toContain("context: ./nginx");
      expect(service).toContain("image: scholar-nginx");
      expect(service).not.toContain("./nginx/nginx.conf:/etc/nginx");
      expect(service).not.toContain("./nginx/conf.d:/etc/nginx");
    }
    expect(NGINX_DOCKERFILE).toContain("COPY nginx.conf /etc/nginx/nginx.conf");
    expect(NGINX_DOCKERFILE).toContain("COPY conf.d/ /etc/nginx/conf.d/");
    expect(DEPLOY_SCRIPT).toMatch(/docker compose -f "\$\{COMPOSE_FILE\}" build nginx/);
  });

  it("publishes the static community skills entry in the SEO sitemap", () => {
    expect(STATIC_SITEMAP_SOURCE).toMatch(
      /\{"\/tools\/skills",\s*"weekly",\s*"0\.7"\}/,
    );
  });

  it("redirects both legacy skills hub spellings before the private skills SPA", () => {
    const redirect = EDGE_NGINX.indexOf("location ~ ^/skills/?$");
    const privateSkills = EDGE_NGINX.indexOf(
      "location ~ ^/(admin|dashboard|auth|wechat|github",
    );

    expect(redirect).toBeGreaterThan(-1);
    expect(redirect).toBeLessThan(privateSkills);
    expect(EDGE_NGINX).toContain(
      "location ~ ^/skills/?$ { return 301 /tools/skills$is_args$args; }",
    );
  });

  it("redirects the legacy QA index to the canonical help hub", () => {
    expect(EDGE_NGINX).toContain(
      "location = /qa { return 301 /help$is_args$args; }",
    );
  });
});

describe("faceted search canonical contract", () => {
  it.each([
    ["src/features/search/pages/SearchPage.tsx", "/search"],
    ["src/features/journals/pages/JournalSearchPage.tsx", "/journals/search"],
    ["src/features/tools/pages/ToolsCatalogPage.tsx", "/tools"],
    ["src/features/tools/pages/ToolsSkillsPage.tsx", "/tools/skills"],
  ])(
    "%s uses a clean canonical and noindexes query state",
    (file, canonical) => {
      const page = source(file);
      expect(page).toContain(`canonical="${canonical}"`);
      expect(page).toMatch(/noindex=\{(?:hasSearchState|search\.length > 0)\}/);
    },
  );
});
