import { describe, expect, it, vi } from "vitest";
import {
  AssetLoadError,
  loadAssetMap,
  validateAssets,
} from "../../src/core/assets.js";
import { clamp, rectanglesOverlap } from "../../src/core/collision.js";
import { fitGame } from "../../src/core/layout.js";
import { watchReducedMotion } from "../../src/core/motion.js";
import {
  advanceTimer,
  decrementLives,
  transition,
} from "../../src/core/state.js";

describe("responsive game fit", () => {
  it("does not upscale beyond the native canvas", () => {
    expect(fitGame(1200, 800)).toEqual({ width: 960, height: 576, scale: 1 });
  });

  it("reserves control height in a short landscape viewport", () => {
    expect(fitGame(640, 360, 80)).toEqual({
      width: 467,
      height: 280,
      scale: 0.486,
    });
  });

  it("handles unavailable space without negative dimensions", () => {
    expect(fitGame(320, 40, 80)).toEqual({ width: 0, height: 0, scale: 0 });
  });
});

describe("reduced motion preference", () => {
  it("reports the initial preference and reacts to runtime changes", () => {
    const listeners = new Set();
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn((event, listener) => {
        if (event === "change") listeners.add(listener);
      }),
      removeEventListener: vi.fn((event, listener) => {
        if (event === "change") listeners.delete(listener);
      }),
    };
    const matchMedia = vi.fn(() => mediaQuery);
    const onChange = vi.fn();

    const stopWatching = watchReducedMotion(matchMedia, onChange);

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(onChange).toHaveBeenLastCalledWith(true);

    mediaQuery.matches = false;
    for (const listener of listeners) listener({ matches: false });
    expect(onChange).toHaveBeenLastCalledWith(false);

    stopWatching();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(listeners).toHaveLength(0);
  });
});

describe("game state", () => {
  it("supports explicit start and pause transitions", () => {
    expect(transition("title", "start")).toBe("play");
    expect(transition("play", "pause")).toBe("pause");
    expect(transition("pause", "pause")).toBe("play");
  });

  it("keeps unsupported transitions stable", () => {
    expect(transition("title", "win")).toBe("title");
  });

  it("expires the timer deterministically", () => {
    expect(advanceTimer(1, 0, 60)).toEqual({
      timer: 0,
      timerTicks: 0,
      expired: true,
    });
  });

  it("carries partial ticks and decrements lives safely", () => {
    expect(advanceTimer(3, 40, 30)).toEqual({
      timer: 2,
      timerTicks: 10,
      expired: false,
    });
    expect(decrementLives(1)).toEqual({ lives: 0, gameOver: true });
    expect(decrementLives(0)).toEqual({ lives: 0, gameOver: true });
  });
});

describe("asset validation", () => {
  it("reports every missing required asset", () => {
    expect(() =>
      validateAssets({ hero: null, tiles: {} }, ["hero", "tiles"]),
    ).toThrowError(AssetLoadError);
    expect(() => validateAssets({ hero: null }, ["hero"])).toThrow(/hero/);
  });

  it("reports progress and rejects an incomplete load", async () => {
    class FakeImage {
      set src(value) {
        queueMicrotask(() =>
          value.includes("missing") ? this.onerror() : this.onload(),
        );
      }
    }
    const onProgress = vi.fn();
    await expect(
      loadAssetMap(
        { hero: "/hero.png", boss: "/missing.png" },
        { ImageConstructor: FakeImage, onProgress },
      ),
    ).rejects.toMatchObject({ missing: ["boss"] });
    expect(onProgress).toHaveBeenLastCalledWith({
      loaded: 2,
      total: 2,
      percent: 100,
    });
  });
});

describe("collision helpers", () => {
  it("treats edge contact as non-overlap", () => {
    expect(
      rectanglesOverlap(
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 10, y: 0, w: 10, h: 10 },
      ),
    ).toBe(false);
    expect(
      rectanglesOverlap(
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 9, y: 0, w: 10, h: 10 },
      ),
    ).toBe(true);
  });

  it("clamps to either boundary", () => {
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });
});
