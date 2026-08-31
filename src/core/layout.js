export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 576;

// A portrait screen cannot show the wide view at a readable size, so it gets a
// narrower world slice instead. The extra height is sky above the level, capped
// so a very tall phone does not turn the stage into mostly empty air.
export const PORTRAIT_WIDTH = 480;
export const PORTRAIT_MAX_HEIGHT = 640;

export function chooseView(viewportWidth, viewportHeight) {
  if (viewportWidth >= viewportHeight) {
    return { width: GAME_WIDTH, height: GAME_HEIGHT };
  }
  const proportional = Math.round(
    (PORTRAIT_WIDTH * viewportHeight) / viewportWidth,
  );
  return {
    width: PORTRAIT_WIDTH,
    height: Math.min(PORTRAIT_MAX_HEIGHT, Math.max(GAME_HEIGHT, proportional)),
  };
}

export function fitGame(
  viewportWidth,
  viewportHeight,
  controlsHeight = 0,
  view = { width: GAME_WIDTH, height: GAME_HEIGHT },
) {
  const availableWidth = Math.max(0, viewportWidth);
  const availableHeight = Math.max(
    0,
    viewportHeight - Math.max(0, controlsHeight),
  );
  const scale = Math.min(
    1,
    availableWidth / view.width,
    availableHeight / view.height,
  );
  return {
    width: Math.round(view.width * scale),
    height: Math.round(view.height * scale),
    scale: Number(scale.toFixed(3)),
  };
}
