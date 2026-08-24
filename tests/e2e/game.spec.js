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
  expect(resizedCanvas.width / resizedCanvas.height).toBeCloseTo(5 / 3, 1);

  const frame = await page.getByTestId("canvas-frame").boundingBox();
  expect(frame.y + frame.height).toBeLessThanOrEqual(667);
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
