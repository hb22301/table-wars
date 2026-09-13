type RouteMetadata = {
  title: string;
  description: string;
  path: string;
  indexable: boolean;
};

const SOCIAL_IMAGE_PATH = '/multiplication-tables-social-preview.png';
const SOCIAL_IMAGE_ALT = 'Multiplication Tables timed practice with colorful multiplication symbols';

export const routeMetadata: Record<string, RouteMetadata> = {
  '/': {
    title: 'Timed Multiplication Practice | Multiplication Tables',
    description: 'Build faster multiplication recall with focused timed practice, adjustable table ranges, instant scoring, and shared leaderboards.',
    path: '/',
    indexable: true,
  },
  '/tables': {
    title: 'Multiplication Tables 2–20 | Study Mode',
    description: 'Study multiplication tables from 2 to 20 with an interactive reference for factors 1 through 12, then return to timed practice.',
    path: '/tables',
    indexable: true,
  },
  '/play': {
    title: 'Multiplication Practice Session | Multiplication Tables',
    description: 'Work through a focused timed multiplication practice session and build a stronger answer streak.',
    path: '/play',
    indexable: false,
  },
  '/results': {
    title: 'Practice Results | Multiplication Tables',
    description: 'Review your multiplication practice score, accuracy, streak, and missed answers.',
    path: '/results',
    indexable: false,
  },
  '/creator': {
    title: 'Creator Tools | Multiplication Tables',
    description: 'Restricted creator tools for managing shared multiplication practice leaderboard entries and feedback.',
    path: '/creator',
    indexable: false,
  },
  '/sign-in': {
    title: 'Creator Sign In | Multiplication Tables',
    description: 'Sign in to access the restricted multiplication practice creator tools.',
    path: '/sign-in',
    indexable: false,
  },
  '*': {
    title: 'Page Not Found | Multiplication Tables',
    description: 'The requested multiplication practice page could not be found.',
    path: '/',
    indexable: false,
  },
};

function normalizePath(pathname: string) {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || '/';
  if (withoutQuery === '/') return '/';
  return withoutQuery.replace(/\/+$/, '') || '/';
}

function getRouteMetadata(pathname: string) {
  const normalizedPath = normalizePath(pathname);
  if (normalizedPath.startsWith('/sign-in')) return routeMetadata['/sign-in'];
  return routeMetadata[normalizedPath] ?? routeMetadata['*'];
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}

export function applyRouteMetadata(pathname: string, basePath: string) {
  const metadata = getRouteMetadata(pathname);
  const normalizedBasePath = basePath ? `/${basePath.replace(/^\/+|\/+$/g, '')}` : '';
  const canonicalPath = metadata.path === '/' ? normalizedBasePath || '/' : `${normalizedBasePath}${metadata.path}`;
  const configuredSiteUrl = import.meta.env.VITE_SITE_URL?.replace(/\/+$/, '');
  const siteUrl = configuredSiteUrl || window.location.origin;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;

  document.title = metadata.title;
  setMeta('name', 'description', metadata.description);
  setMeta('name', 'robots', metadata.indexable ? 'index, follow' : 'noindex, nofollow');
  setMeta('property', 'og:title', metadata.title);
  setMeta('property', 'og:description', metadata.description);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:url', canonicalUrl);
  setMeta('property', 'og:site_name', 'Multiplication Tables');
  const socialImageUrl = `${siteUrl}${SOCIAL_IMAGE_PATH}`;
  setMeta('property', 'og:image', socialImageUrl);
  setMeta('property', 'og:image:alt', SOCIAL_IMAGE_ALT);
  setMeta('property', 'og:image:type', 'image/png');
  setMeta('property', 'og:image:width', '1200');
  setMeta('property', 'og:image:height', '630');
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', metadata.title);
  setMeta('name', 'twitter:description', metadata.description);
  setMeta('name', 'twitter:url', canonicalUrl);
  setMeta('name', 'twitter:image', socialImageUrl);
  setMeta('name', 'twitter:image:alt', SOCIAL_IMAGE_ALT);
  setCanonical(canonicalUrl);
}