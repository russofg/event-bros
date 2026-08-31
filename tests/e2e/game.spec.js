import { expect, test } from "@playwright/test";

test("shows loading progress and reaches the title state", async ({ page }) => {
  await page.route("**/assets/bg.png", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Preparando|Cargando/ })
      .first(),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("body")).toHaveAttribute(
    "data-game-state",
    "title",
  );
  await expect(page.getByTestId("game-status")).toContainText("Juego listo");
});

test("keyboard starts, pauses and mutes the game", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-game-state", "play");
  await page.keyboard.press("p");
  await expect(page.locator("body")).toHaveAttribute(
    "data-game-state",
    "pause",
  );
  await page.keyboard.press("m");
  await expect(page.locator("body")).toHaveAttribute("data-muted", "true");
  await expect(page.getByTestId("game-status")).toContainText("silenciado");
});

test("fits the canvas and controls inside a short landscape viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  const canvasLocator = page.locator("canvas");
  const canvas = await canvasLocator.boundingBox();
  expect(canvas).not.toBeNull();
  expect(canvas.width).toBeLessThanOrEqual(667);
  expect(canvas.height).toBeLessThanOrEqual(375);
  await expect
    .poll(() => canvasLocator.evaluate((element) => element.style.inlineSize))
    .toMatch(/px$/);
  const firstInlineSize = await canvasLocator.evaluate(
    (element) => element.style.inlineSize,
  );

  await page.setViewportSize({ width: 375, height: 667 });
  await expect
    .poll(() => canvasLocator.evaluate((element) => element.style.inlineSize))
    .not.toBe(firstInlineSize);
  const resizedCanvas = await canvasLocator.boundingBox();
  // Portrait renders the narrow view, so the stage is taller than it is wide.
  expect(resizedCanvas.width / resizedCanvas.height).toBeLessThan(1);

  const frame = await page.getByTestId("canvas-frame").boundingBox();
  expect(frame.y + frame.height).toBeLessThanOrEqual(667);
});

function renderedView(page) {
  return page
    .locator("canvas")
    .evaluate((canvas) => `${canvas.width}x${canvas.height}`);
}

test("switches the rendered viewport with the orientation", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch controls render only on touch viewports.");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect.poll(() => renderedView(page)).toBe("960x576");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => renderedView(page)).not.toBe("960x576");

  const portrait = await page
    .locator("canvas")
    .evaluate((canvas) => ({ w: canvas.width, h: canvas.height }));
  expect(portrait.w).toBe(480);
  expect(portrait.h).toBeGreaterThan(576);
  expect(portrait.h).toBeLessThanOrEqual(640);

  // Rotating back must restore the wide view, not keep the narrow one.
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => renderedView(page)).toBe("960x576");
});

test("portrait stage covers most of the screen", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch controls render only on touch viewports.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

  const canvas = await page.locator("canvas").boundingBox();
  // Before the orientation aware viewport this was 220px, about 26% of the screen.
  expect(canvas.height).toBeGreaterThan(844 * 0.5);
  expect(canvas.width).toBeGreaterThan(390 * 0.9);
});

async function padBoxes(page) {
  const [canvas, move, act] = await Promise.all([
    page.locator("canvas").boundingBox(),
    page.getByTestId("pad-move").boundingBox(),
    page.getByTestId("pad-act").boundingBox(),
  ]);
  return { canvas, move, act };
}

test("landscape splits movement and action controls between both hands", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch controls render only on touch viewports.");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

  const { canvas, move, act } = await padBoxes(page);

  // Movement stays under the left thumb, actions under the right one.
  expect(move.x + move.width).toBeLessThanOrEqual(canvas.x + 1);
  expect(act.x + 1).toBeGreaterThanOrEqual(canvas.x + canvas.width);

  // Neither cluster may cover the play area.
  expect(move.x).toBeGreaterThanOrEqual(0);
  expect(act.x + act.width).toBeLessThanOrEqual(844);
});

test("portrait puts the stage on top and the controls in the thumb zone", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch controls render only on touch viewports.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

  const { canvas, move, act } = await padBoxes(page);

  // The stage sits near the top instead of floating in dead space.
  expect(canvas.y).toBeLessThan(844 * 0.25);

  // Both clusters live in the lower third, split left and right.
  expect(move.y).toBeGreaterThan(844 * 0.55);
  expect(act.y).toBeGreaterThan(844 * 0.55);
  expect(move.x + move.width).toBeLessThan(390 / 2);
  expect(act.x).toBeGreaterThan(390 / 2);

  // Controls never overlap the stage.
  expect(move.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
  expect(act.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
});

test("portrait uses the freed space for larger tap targets", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch controls render only on touch viewports.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

  const sizes = await page
    .locator("[data-testid='pad-move'] button, [data-testid='pad-act'] button")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );

  expect(sizes).toHaveLength(4);
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(56);
    expect(size.height).toBeGreaterThanOrEqual(56);
  }
});

test("every touch target clears the minimum size in both orientations", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch controls render only on touch viewports.");
  await page.goto("/");

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    const sizes = await page
      .locator(".touch-button")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return Math.min(rect.width, rect.height);
        }),
      );
    expect(sizes.length).toBeGreaterThan(0);
    for (const smallest of sizes) expect(smallest).toBeGreaterThanOrEqual(48);
  }
});

test("controls stay reachable when browser chrome eats the viewport", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch controls render only on touch viewports.");
  await page.goto("/");

  // A phone screen is 844 tall, but Safari keeps a slice for its toolbars and
  // the page never scrolls, so anything past the fold is simply unreachable.
  for (const height of [844, 760, 700, 640, 600]) {
    await page.setViewportSize({ width: 390, height });
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

    // Refitting runs through a ResizeObserver and an animation frame, so poll
    // instead of reading the layout the instant the viewport changes.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const limit = window.innerHeight;
          const lowestButton = [
            ...document.querySelectorAll(".touch-button"),
          ].reduce(
            (max, node) => Math.max(max, node.getBoundingClientRect().bottom),
            0,
          );
          const frame = document
            .querySelector("[data-testid='canvas-frame']")
            .getBoundingClientRect();
          return Math.max(
            lowestButton - limit,
            frame.bottom - limit,
            document.documentElement.scrollHeight - limit,
          );
        }),
      )
      .toBeLessThanOrEqual(0);
  }
});

test("keyboard focus has a visible focus indicator", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Saltar al juego" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS("outline-style", "solid");
  await expect(skipLink).toHaveCSS("outline-width", "3px");
  await expect(skipLink).toHaveCSS("outline-color", "rgb(255, 210, 63)");
});

test("touch controls expose movement, crouch, jump, pause and mute states", async ({
  page,
  isMobile,
}) => {
  test.skip(
    !isMobile,
    "Touch controls are exposed only on touch-oriented viewports.",
  );
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

  for (const name of [
    "Mover a la izquierda",
    "Mover a la derecha",
    "Agacharse",
    "Saltar",
  ]) {
    const control = page.getByRole("button", { name });
    await expect(control).toHaveAttribute("aria-pressed", "false");
    await control.dispatchEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
    });
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await control.dispatchEvent("pointerup", {
      pointerId: 1,
      pointerType: "touch",
    });
    await expect(control).toHaveAttribute("aria-pressed", "false");
  }

  await expect(page.locator("body")).toHaveAttribute("data-game-state", "play");
  await page
    .getByRole("button", { name: "Pausar juego" })
    .click({ force: true });
  await expect(
    page.getByRole("button", { name: "Pausar juego" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Silenciar sonido" })
    .click({ force: true });
  await expect(
    page.getByRole("button", { name: "Silenciar sonido" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("recovers from a deterministic required-asset failure", async ({
  page,
}) => {
  await page.route("**/assets/boss.png", (route) => route.abort("failed"));
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("boss");
  await page.unroute("**/assets/boss.png");
  await page.getByRole("button", { name: "Reintentar carga" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("alert")).toBeHidden();
});

test("exposes semantic instructions, status and accessible controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Escenario de Event Bros/ }),
  ).toBeVisible();
  await expect(page.getByText("Cómo jugar")).toBeVisible();
  await expect(page.getByTestId("game-status")).toHaveAttribute(
    "aria-live",
    "polite",
  );
  await expect(page.locator("#bp")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#bp")).toHaveAttribute(
    "aria-label",
    "Pausar juego",
  );
});

test("reports an actionable error when the gameplay canvas is unsupported", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      if (this.id === "game" && type === "2d") return null;
      return getContext.call(this, type, options);
    };
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Tu navegador no admite el lienzo 2D necesario para jugar",
  );
  await expect(page.getByRole("alert")).toContainText(
    "actualizá el navegador o usá otro compatible",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-game-state",
    "unsupported",
  );
  await expect(page.locator("body")).toHaveAttribute("data-ready", "false");
  await expect(
    page.getByRole("button", { name: "Reintentar carga" }),
  ).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("exposes queryable gameplay decisions and controlled event announcements", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

  const state = page.getByRole("region", {
    name: "Estado accesible de la partida",
  });
  const summary = page.getByTestId("gameplay-state");
  await expect(state).toBeAttached();
  await expect(summary).toHaveAttribute("aria-live", "off");
  await expect(summary).toContainText(/Avance: \d+%/);
  await expect(summary).toContainText("Puntaje: 0");
  await expect(summary).toContainText("Vidas: 3");
  await expect(summary).toContainText("Tiempo: 400 segundos");
  await expect(summary).toContainText(/Peligro cercano:/);
  await expect(summary).toContainText(/Objetivo:/);

  const announcement = page.getByTestId("game-status");
  await expect(announcement).toHaveAttribute("aria-live", "polite");
  await expect(announcement).toHaveAttribute("aria-atomic", "true");

  const initialSummary = await summary.textContent();
  await page.keyboard.press("Enter");
  await expect.poll(() => summary.textContent()).not.toBe(initialSummary);
  const startedSummary = await summary.textContent();
  await page.evaluate(() => {
    window.announcementMutations = 0;
    new MutationObserver(() => {
      window.announcementMutations++;
    }).observe(document.querySelector("#game-status"), {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.keyboard.down("ArrowRight");
  await expect.poll(() => summary.textContent()).not.toBe(startedSummary);
  await page.keyboard.up("ArrowRight");
  await expect(summary).toContainText(/Estado: jugando/);
  await expect(summary).toContainText(/Posición:/);
  await expect(summary).toContainText(/Tiempo: 39\d segundos/);
  await expect(announcement).toContainText("Partida iniciada");
  expect(await page.evaluate(() => window.announcementMutations)).toBe(0);
});
