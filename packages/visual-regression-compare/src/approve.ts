import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  isSafeRelativePath,
  mergeManifests,
  projectDirInRepo,
  readManifestFile,
  selectEntries,
  summarize,
  toRepoPath,
  writeManifestFile,
  type Manifest,
  type ManifestEntry,
  type MergedEntry,
} from 'visual-regression-manifest';

export type ApproveOptions = {
  /** Manifest files to read (the run may have several). */
  manifests: string[];
  /** The repository root the paths are applied to; default the working directory. */
  repoRoot?: string;
  /** Every entry that needs a human (default), or entries by name (`name` or `name (platform label)`). */
  names?: string[];
  /** Only entries of this test file (relative to the manifest's project root). */
  testFile?: string;
  /** Approve although the baseline or the actual file changed since the run. */
  force?: boolean;
  /** Report what would happen without touching any file. */
  dryRun?: boolean;
};

export type Skipped = { entry: ManifestEntry; reason: string };

export type ApproveResult = {
  approved: ManifestEntry[];
  skipped: Skipped[];
  /** Baseline files written, relative to the repository root: what to commit. */
  files: string[];
  warnings: string[];
  unknown: string[];
};

const sha256 = (file: string) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/**
 * Where the project of a manifest is, for applying its paths: the directory
 * inside the repository (from `ci.workspace` for a CI run, else from where
 * the project root lies below `repoRoot`) and the directory its paths resolve
 * against. A project root outside the repository root is used as it is.
 */
const locateProject = (manifest: Manifest, repoRoot: string) => {
  if (manifest.ci?.workspace) {
    return { projectDir: projectDirInRepo(manifest), base: repoRoot };
  }
  const relative = path
    .relative(repoRoot, manifest.projectRoot)
    .split(path.sep)
    .join('/');
  if (relative === '') return { projectDir: '', base: repoRoot };
  return isSafeRelativePath(relative)
    ? { projectDir: relative, base: repoRoot }
    : { projectDir: '', base: manifest.projectRoot };
};

/**
 * Applies the approvals of a run: copies each selected entry's actual image
 * over its baseline, deletes the actual and diff files and rewrites the
 * entry in its manifest as `approved`. Works on any manifest.
 */
export const approve = ({
  manifests,
  repoRoot = process.cwd(),
  names,
  testFile,
  force = false,
  dryRun = false,
}: ApproveOptions): ApproveResult => {
  const root = path.resolve(repoRoot);
  const sources = manifests.map((file) => ({
    file,
    label: file,
    manifest: readManifestFile(file),
  }));
  const run = mergeManifests(sources);
  const picked = selectEntries(run, names ? { names } : 'all');
  const explicit = names !== undefined;
  const chosen = testFile
    ? picked.entries.filter((m) => m.entry.test.filePath === testFile)
    : picked.entries;

  const result: ApproveResult = {
    approved: [],
    skipped: [],
    files: [],
    warnings: run.warnings,
    unknown: picked.unknown,
  };
  const changed = new Set<(typeof sources)[number]>();

  const skip = (m: MergedEntry<(typeof sources)[number]>, reason: string) =>
    result.skipped.push({ entry: m.entry, reason });

  for (const m of chosen) {
    const { entry, source } = m;
    if (m.unapprovableReason) {
      skip(m, `cannot be approved: ${m.unapprovableReason}`);
      continue;
    }
    if (!explicit && m.collidesWith.length > 0) {
      skip(m, 'writes the same baseline as another entry; name one to approve');
      continue;
    }
    const { projectDir, base } = locateProject(source.manifest, root);
    const actualRepo = toRepoPath(projectDir, entry.images.actual.path);
    const baselineRepo = toRepoPath(projectDir, entry.images.baseline.path);
    if (!actualRepo || !baselineRepo) {
      skip(m, 'its paths are outside the repository');
      continue;
    }
    const actual = path.join(base, actualRepo);
    const baseline = path.join(base, baselineRepo);
    const diffRepo = toRepoPath(projectDir, entry.images.diff.path);

    if (!fs.existsSync(actual)) {
      skip(m, 'the actual image is gone');
      continue;
    }
    if (!force) {
      if (entry.hashes?.actual && entry.hashes.actual !== sha256(actual)) {
        skip(m, 'the actual image changed since the run (stale)');
        continue;
      }
      const baselineNow = fs.existsSync(baseline)
        ? sha256(baseline)
        : undefined;
      if (baselineNow !== entry.hashes?.baseline) {
        skip(m, 'the baseline changed since the run (stale)');
        continue;
      }
    }

    if (!dryRun) {
      fs.mkdirSync(path.dirname(baseline), { recursive: true });
      fs.copyFileSync(actual, baseline);
      fs.rmSync(actual, { force: true });
      if (diffRepo) fs.rmSync(path.join(base, diffRepo), { force: true });
      Object.assign(entry, {
        status: 'approved',
        images: {
          baseline: entry.images.baseline,
          actual: { path: null },
          diff: { path: null },
        },
        baselineWritten: true,
        recordedAt: new Date().toISOString(),
        hashes: { baseline: sha256(baseline) },
        message: 'Baseline image was replaced with the approved screenshot.',
      } satisfies Partial<ManifestEntry>);
      changed.add(source);
    }
    result.approved.push(entry);
    result.files.push(baselineRepo);
  }

  for (const { file, manifest } of changed) {
    manifest.summary = summarize(manifest.entries);
    manifest.updatedAt = new Date().toISOString();
    writeManifestFile(file, manifest);
  }
  return result;
};
