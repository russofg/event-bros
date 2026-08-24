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

export function loadImage(url, ImageConstructor = Image) {
  return new Promise((resolve, reject) => {
    const image = new ImageConstructor();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    image.src = url;
  });
}

export async function loadAssetMap(
  urls,
  { onProgress = () => {}, ImageConstructor = Image } = {},
) {
  const entries = Object.entries(urls);
  let loaded = 0;
  const settled = await Promise.all(
    entries.map(async ([name, url]) => {
      try {
        return [name, await loadImage(url, ImageConstructor)];
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
