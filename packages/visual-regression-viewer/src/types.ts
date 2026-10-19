import type { ManifestStatus } from 'visual-regression-manifest';

/** What the viewer page renders; embedded into the page as JSON. */
export type ViewerData = {
  title: string;
  /** Number of manifest files the run was merged from. */
  manifests: number;
  tool: { name: string; version?: string };
  runner: { name: string; version?: string };
  counts: Record<ManifestStatus, number>;
  warnings: string[];
  entries: ViewerEntry[];
};

export type ViewerEntry = {
  /** Short, URL-safe identity of the entry. */
  id: string;
  name: string;
  status: ManifestStatus;
  needsHuman: boolean;
  test: { filePath: string; titlePath: string[]; retry: number };
  /** `linux / chrome (docker chromium)` or `''`. */
  platform: string;
  viewport?: { width: number; height: number };
  message: string;
  /** The manifest file the entry came from, relative to the run directory. */
  source: string;
  comparison: {
    diffRatio: number;
    maxDiffRatio?: number;
    colorThreshold?: number;
    colorMetric?: string;
  };
  /** URLs relative to the page, `null` when the file is not part of the run. */
  images: {
    baseline: string | null;
    actual: string | null;
    diff: string | null;
  };
  /** The paths as the manifest names them, for display. */
  paths: { baseline: string; actual: string | null; diff: string | null };
};
