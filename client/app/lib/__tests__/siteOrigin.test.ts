import robots from "../../robots";
import sitemap from "../../sitemap";
import { getSiteOrigin, getSiteUrl } from "../siteOrigin";

describe("site origin helpers", () => {
  const originalAppOrigin = process.env.BATTLESTATS_APP_ORIGIN;
  const originalPublicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (originalAppOrigin === undefined) {
      delete process.env.BATTLESTATS_APP_ORIGIN;
    } else {
      process.env.BATTLESTATS_APP_ORIGIN = originalAppOrigin;
    }

    if (originalPublicSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalPublicSiteUrl;
    }
  });

  it("prefers the deploy app origin and trims a trailing slash", () => {
    process.env.BATTLESTATS_APP_ORIGIN = "https://battlestats.online/";
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(getSiteOrigin()).toBe("https://battlestats.online");
    expect(getSiteUrl("/robots.txt")).toBe("https://battlestats.online/robots.txt");
  });

  it("falls back to the public site url when the deploy origin is unset", () => {
    delete process.env.BATTLESTATS_APP_ORIGIN;
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.battlestats.online/";

    expect(getSiteOrigin()).toBe("https://www.battlestats.online");
  });

  it("builds a robots response with a sitemap reference", () => {
    process.env.BATTLESTATS_APP_ORIGIN = "https://battlestats.online";

    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
      },
      sitemap: "https://battlestats.online/sitemap.xml",
    });
  });

  it("builds a sitemap rooted at the canonical site origin", async () => {
    process.env.BATTLESTATS_APP_ORIGIN = "https://battlestats.online";

    const entries = await sitemap();

    // Root plus the 15 static tier x type ship-standings buckets. Player and
    // clan entries come from an upstream fetch that is not stubbed here.
    expect(entries).toHaveLength(16);
    expect(entries[0]).toMatchObject({
      url: "https://battlestats.online/",
      changeFrequency: "daily",
      priority: 1,
    });
    expect(entries[0].lastModified).toBeInstanceOf(Date);
  });

  it("lists every ship-standings bucket, canonical and free of view state", async () => {
    process.env.BATTLESTATS_APP_ORIGIN = "https://battlestats.online";

    const buckets = (await sitemap()).filter((e) => e.url.includes("/ships/"));

    expect(buckets).toHaveLength(15);
    expect(buckets.map((e) => e.url)).toContain("https://battlestats.online/ships/t10-battleships");
    // A bucket is one page; the percentile and column sort must not fragment it.
    for (const entry of buckets) {
      expect(entry.url).not.toContain("?");
    }
  });
});