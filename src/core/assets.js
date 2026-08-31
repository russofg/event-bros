export const DEFAULT_ASSET_TIMEOUT_MS = 15000;

export class AssetLoadError extends Error {
  constructor(missing) {
    super(
      `No se pudieron cargar los recursos requeridos: ${missing.join(", ")}`,
    );
    this.name = "AssetLoadError";
    this.missing = missing;
  }
}

export function validateAssets(assets, required = Object.keys(assets)) {
  const missing = required.filter((name) => !assets[name]);
  if (missing.length) throw new AssetLoadError(missing);
  return assets;
}

export function loadImage(
  url,
  ImageConstructor = Image,
  timeoutMs = DEFAULT_ASSET_TIMEOUT_MS,
) {
  return new Promise((resolve, reject) => {
    const image = new ImageConstructor();
    let timer = null;
    let settled = false;

    const finish = (action, value) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      action(value);
    };

    image.onload = () => finish(resolve, image);
    image.onerror = () => finish(reject, new Error(`No se pudo cargar ${url}`));

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        // Drop the in-flight request so a stalled connection is not kept open
        // behind a loading screen that would otherwise never resolve.
        image.src = "";
        finish(
          reject,
          new Error(`La carga de ${url} superó el límite de ${timeoutMs} ms`),
        );
      }, timeoutMs);
    }

    image.src = url;
  });
}

export async function loadAssetMap(
  urls,
  {
    onProgress = () => {},
    ImageConstructor = Image,
    timeoutMs = DEFAULT_ASSET_TIMEOUT_MS,
  } = {},
) {
  const entries = Object.entries(urls);
  let loaded = 0;
  const settled = await Promise.all(
    entries.map(async ([name, url]) => {
      try {
        return [name, await loadImage(url, ImageConstructor, timeoutMs)];
      } catch {
        return [name, null];
      } finally {
        loaded += 1;
        onProgress({
          loaded,
          total: entries.length,
          percent: Math.round((loaded / entries.length) * 100),
        });
      }
    }),
  );
  return validateAssets(
    Object.fromEntries(settled),
    entries.map(([name]) => name),
  );
}
