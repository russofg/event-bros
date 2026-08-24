export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 576;

export function fitGame(viewportWidth, viewportHeight, controlsHeight = 0) {
  const availableWidth = Math.max(0, viewportWidth);
  const availableHeight = Math.max(
    0,
    viewportHeight - Math.max(0, controlsHeight),
  );
  const scale = Math.min(
    1,
    availableWidth / GAME_WIDTH,
    availableHeight / GAME_HEIGHT,
  );
  return {
    width: Math.round(GAME_WIDTH * scale),
    height: Math.round(GAME_HEIGHT * scale),
    scale: Number(scale.toFixed(3)),
  };
}
