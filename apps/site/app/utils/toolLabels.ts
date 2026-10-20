/** Human labels for the enum fields of `data/tools/*.yml`, shared by the tool list and the landing page teaser. */
export const TOOL_CATEGORIES = {
  'runner-integration': 'Runner integrations',
  'hosted-review': 'Hosted review services',
  'mobile-native': 'Mobile and native',
} as const;

export const TOOL_LABELS: Record<string, Record<string, string>> = {
  hosting: {
    local: 'local',
    'self-hosted': 'self-hosted',
    cloud: 'cloud',
    'local-or-cloud': 'local or cloud',
  },
  reviewSurface: {
    local: 'local files',
    pr: 'pull request',
    'web-app': 'web app',
    ide: 'IDE',
  },
  baselineStorage: {
    repo: 'repository',
    service: 'service',
    'repo-or-service': 'repository or service',
  },
  pricingModel: {
    free: 'free',
    freemium: 'free tier, paid plans',
    'per-screenshot': 'per screenshot',
    'per-seat': 'per seat',
    custom: 'custom quote',
  },
  machineReadableResults: {
    manifest: 'run manifest',
    'json-report': 'JSON report',
    'images-only': 'images only',
    'none-cloud': 'none, results stay in the service',
    none: 'none',
  },
  manifestSupport: {
    native: 'writes it',
    converter: 'converter',
    generic: 'generic converter',
    none: 'none',
  },
};

export const toolLabel = (field: string, value: string) =>
  TOOL_LABELS[field]?.[value] ?? value;

export const resultsColor = (value: string) =>
  value === 'manifest' || value === 'json-report'
    ? 'primary'
    : value === 'images-only'
      ? 'warning'
      : 'neutral';

export const manifestColor = (value: string) =>
  value === 'native' ? 'primary' : value === 'converter' ? 'info' : 'neutral';

/** `URL` is not exposed to Vue templates, so format source links here. */
export const sourceLabel = (source: string) => {
  try {
    const { hostname, pathname } = new URL(source);
    return hostname + pathname;
  } catch {
    return source;
  }
};
