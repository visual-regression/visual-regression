import { unzip } from 'fflate';

/** The files of a dropped folder or an unpacked zip: the path inside it and the file. */
export type RunFile = { path: string; file: File };

/**
 * Largest amount of data a zip may unpack to; a guard against zip bombs.
 * The sizes it adds up are the declared ones, which is sound: fflate never
 * unpacks an entry to more than the size it declares.
 */
export const MAX_UNZIPPED_BYTES = 1024 ** 3;

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  json: 'application/json',
};

export const isZipName = (name: string) => /\.zip$/i.test(name);

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Unpacks a zip in a worker; entries become files under `<zip name without .zip>/`. */
export const unzipRunFiles = (
  bytes: Uint8Array,
  zipPath: string,
): Promise<RunFile[]> =>
  new Promise((resolve, reject) => {
    const prefix = zipPath.replace(/\.zip$/i, '');
    let total = 0;
    try {
      unzip(
        bytes,
        {
          filter: ({ name, originalSize }) => {
            // a name that climbs out of the archive points at nothing in a browser
            if (name.endsWith('/') || name.startsWith('/')) return false;
            if (name.split('/').includes('..')) return false;
            total += originalSize;
            if (total > MAX_UNZIPPED_BYTES) {
              throw new Error(
                `${basename(zipPath)} unpacks to more than ${MAX_UNZIPPED_BYTES / 1024 ** 3} GiB`,
              );
            }
            return true;
          },
        },
        (error, entries) => {
          if (error) {
            reject(new Error(`${basename(zipPath)} is not a zip file`));
            return;
          }
          resolve(
            Object.entries(entries).map(([name, content]) => {
              const extension = name
                .slice(name.lastIndexOf('.') + 1)
                .toLowerCase();
              return {
                path: `${prefix}/${name}`,
                file: new File([content as BlobPart], basename(name), {
                  type: CONTENT_TYPES[extension] ?? '',
                }),
              };
            }),
          );
        },
      );
    } catch (error) {
      reject(error);
    }
  });

/** Replaces every zip among `files` with what is inside it. */
export const expandZips = async (files: RunFile[]): Promise<RunFile[]> => {
  const expanded = await Promise.all(
    files.map(async ({ path, file }) =>
      isZipName(file.name)
        ? unzipRunFiles(new Uint8Array(await file.arrayBuffer()), path)
        : [{ path, file }],
    ),
  );
  return expanded.flat();
};

/**
 * Fetches a zip from `address` in the browser and unpacks it. The server
 * has to allow cross-origin reads (CORS); no cookies or credentials are sent.
 */
export const fetchRunFiles = async (address: string): Promise<RunFile[]> => {
  let url: URL;
  try {
    url = new URL(address, location.href);
  } catch {
    throw new Error(`${JSON.stringify(address)} is not a URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${url.href} is not an http(s) URL`);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new Error(
      `Could not fetch ${url.href}. The server has to be reachable and allow cross-origin requests (CORS) from this site.`,
    );
  }
  if (!response.ok) {
    throw new Error(`${url.href} answered ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const name = decodeURIComponent(basename(url.pathname)) || 'archive.zip';
  return unzipRunFiles(bytes, isZipName(name) ? name : `${name}.zip`);
};

/** The zip addresses a page address asks for: `?zip=<url>` (repeatable) and `#zip=<url>`. */
export const zipAddressesOf = (query: unknown, hash: string) => {
  const fromQuery = [query]
    .flat()
    .filter((value): value is string => typeof value === 'string' && !!value);
  return [
    ...fromQuery,
    ...new URLSearchParams(hash.replace(/^#/, '')).getAll('zip'),
  ];
};
