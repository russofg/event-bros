const TRANSITIONS = {
  title: { start: "play" },
  play: { pause: "pause", die: "dying", win: "win" },
  pause: { pause: "play" },
  dying: { gameover: "gameover", respawn: "play" },
  gameover: { start: "play" },
  win: { start: "play" },
};

export function transition(state, event) {
  return TRANSITIONS[state]?.[event] ?? state;
}

export function advanceTimer(timer, timerTicks, elapsedTicks = 1) {
  let nextTimer = timer;
  let nextTicks = timerTicks + elapsedTicks;

  while (nextTicks >= 60 && nextTimer > 0) {
    nextTimer -= 1;
    nextTicks -= 60;
  }

  return { timer: nextTimer, timerTicks: nextTicks, expired: nextTimer === 0 };
}

export function decrementLives(lives) {
  const remaining = Math.max(0, lives - 1);
  return { lives: remaining, gameOver: remaining === 0 };
}
