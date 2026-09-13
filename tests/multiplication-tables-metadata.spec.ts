import { expect, test, type Page } from '@playwright/test';

const publicRoutes = [
  {
    path: '/',
    title: 'Timed Multiplication Practice | Multiplication Tables',
    description:
      'Build faster multiplication recall with focused timed practice, adjustable table ranges, instant scoring, and shared leaderboards.',
  },
  {
    path: '/tables',
    title: 'Multiplication Tables 2–20 | Study Mode',
    description:
      'Study multiplication tables from 2 to 20 with an interactive reference for factors 1 through 12, then return to timed practice.',
  },
] as const;

const restrictedRoutes = ['/play', '/results', '/creator', '/sign-in'];
const expectedSitemapUrls = ['https://table-wars.com/', 'https://table-wars.com/tables'];
const expectedDisallowedRobotsPaths = ['/play', '/results', '/creator', '/sign-in'];
const socialImagePath = '/multiplication-tables-social-preview.png';
const socialImageAlt =
  'Multiplication Tables timed practice with colorful multiplication symbols';

function metaContent(page: Page, selector: string) {
  return page.locator(selector).getAttribute('content');
}

async function expectRouteMetadata(
  page: Page,
  route: (typeof publicRoutes)[number],
) {
  await page.goto(route.path);
  await expect(page).toHaveTitle(route.title);

  const canonicalUrl = new URL(route.path, page.url()).href;
  const socialImageUrl = new URL(socialImagePath, page.url()).href;

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    route.description,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'index, follow',
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    route.title,
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    route.description,
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    'content',
    'website',
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    canonicalUrl,
  );
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    'content',
    'Multiplication Tables',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    socialImageUrl,
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    'content',
    socialImageAlt,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
    'content',
    route.title,
  );
  await expect(
    page.locator('meta[name="twitter:description"]'),
  ).toHaveAttribute('content', route.description);
  await expect(page.locator('meta[name="twitter:url"]')).toHaveAttribute(
    'content',
    canonicalUrl,
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    'content',
    socialImageUrl,
  );
  await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute(
    'content',
    socialImageAlt,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    canonicalUrl,
  );
}

test.describe('public search metadata', () => {
  test('keeps home and study metadata complete and unique', async ({ page }) => {
    const observed = [];

    for (const route of publicRoutes) {
      await expectRouteMetadata(page, route);
      observed.push({
        title: await page.title(),
        description: await metaContent(page, 'meta[name="description"]'),
        ogTitle: await metaContent(page, 'meta[property="og:title"]'),
        ogDescription: await metaContent(
          page,
          'meta[property="og:description"]',
        ),
        twitterTitle: await metaContent(page, 'meta[name="twitter:title"]'),
        twitterDescription: await metaContent(
          page,
          'meta[name="twitter:description"]',
        ),
        canonical: await page
          .locator('link[rel="canonical"]')
          .getAttribute('href'),
      });
    }

    for (const field of [
      'title',
      'description',
      'ogTitle',
      'ogDescription',
      'twitterTitle',
      'twitterDescription',
      'canonical',
    ] as const) {
      expect(
        new Set(observed.map((metadata) => metadata[field])).size,
        `${field} values should be unique across public routes`,
      ).toBe(publicRoutes.length);
    }
  });

  test('keeps restricted routes out of search indexes', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'multiplication-tables-session',
        JSON.stringify({
          playerName: 'Metadata check',
          settings: {
            difficulty: 1,
            sessionDurationMinutes: 3,
            secondsPerQuestion: 7,
            pointsCorrect: 3,
            pointsTimeout: -1,
            pointsWrong: -2,
            tableFrom: 2,
            tableTo: 12,
          },
          questions: [
            {
              multiplicand: 2,
              multiplier: 2,
              answer: 4,
              status: 'pending',
              response: null,
            },
          ],
          sessionSecondsLeft: 180,
          currentIndex: 0,
          score: 0,
          streak: 0,
          maxStreak: 0,
          correctCount: 0,
          wrongCount: 0,
          timeoutCount: 0,
          startedAt: 'metadata-check',
        }),
      );

      const originalPushState = history.pushState.bind(history);
      const originalReplaceState = history.replaceState.bind(history);
      const allowRestrictedRoute = (url: unknown) =>
        typeof url !== 'string' ||
        (!url.startsWith('/') && !url.startsWith(window.location.origin));
      history.pushState = (state, title, url) => {
        if (allowRestrictedRoute(url)) {
          originalPushState(state, title, url);
        }
      };
      history.replaceState = (state, title, url) => {
        if (allowRestrictedRoute(url)) {
          originalReplaceState(state, title, url);
        }
      };
    });

    for (const route of restrictedRoutes) {
      await page.goto(route);
      await expect(
        page.locator('meta[name="robots"]'),
        `robots metadata for restricted route ${route}`,
      ).toHaveAttribute('content', 'noindex, nofollow');
    }
  });

  test('keeps the sitemap limited to intended public pages', async ({
    request,
  }) => {
    const sitemapResponse = await request.get('/sitemap.xml');
    expect(sitemapResponse.ok()).toBeTruthy();
    const sitemap = await sitemapResponse.text();
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      ([, url]) => url,
    );

    expect(sitemapUrls).toEqual(expectedSitemapUrls);
    for (const restrictedRoute of restrictedRoutes) {
      expect(sitemapUrls).not.toContain(
        `https://table-wars.com${restrictedRoute}`,
      );
    }
  });

  test('keeps robots exclusions aligned with restricted routes', async ({
    request,
  }) => {
    const robotsResponse = await request.get('/robots.txt');
    expect(robotsResponse.ok()).toBeTruthy();
    const robots = await robotsResponse.text();

    expect(robots).toContain('Sitemap: https://table-wars.com/sitemap.xml');
    for (const restrictedPath of expectedDisallowedRobotsPaths) {
      expect(robots).toContain(`Disallow: ${restrictedPath}`);
    }
  });
});