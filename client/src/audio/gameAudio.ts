/**
 * One shared mixer for the whole browser tab. Audio continues across turns
 * and React screen re-renders without creating overlapping players.
 */
const BACKGROUND_VOLUME = 0.3;
const DUCKED_VOLUME = 0.015;
const DICE_VOLUME = 1;

let background: HTMLAudioElement | null = null;
let dice: HTMLAudioElement | null = null;
let active = false;

function getBackground(): HTMLAudioElement {
  if (!background) {
    background = new Audio('/background.mp3');
    background.loop = true;
    background.preload = 'auto';
    background.volume = BACKGROUND_VOLUME;
  }
  return background;
}

function getDice(): HTMLAudioElement {
  if (!dice) {
    dice = new Audio('/dice-roll.mp3');
    dice.preload = 'auto';
    dice.volume = DICE_VOLUME;
    dice.addEventListener('ended', restoreBackground);
    dice.addEventListener('pause', restoreBackground);
    dice.addEventListener('error', restoreBackground);
  }
  return dice;
}

function restoreBackground(): void {
  if (background) background.volume = BACKGROUND_VOLUME;
}

function canPlay(): boolean {
  try {
    return localStorage.getItem('dice-roll-sound') !== 'off';
  } catch {
    return true;
  }
}

export function startGameMusic(): void {
  active = true;
  if (!canPlay()) return;
  const audio = getBackground();
  if (audio.paused) {
    void audio.play().catch(() => {
      // iOS Safari requires an explicit tap before playback is allowed.
    });
  }
}

export function stopGameMusic(): void {
  active = false;
  background?.pause();
  dice?.pause();
  restoreBackground();
}

export function playDiceSound(): void {
  if (!active || !canPlay()) return;
  startGameMusic();
  const sound = getDice();
  // Don't interrupt the current recording or restart from zero on another roll.
  if (!sound.paused && !sound.ended) return;
  sound.currentTime = 0;
  if (background) background.volume = DUCKED_VOLUME;
  void sound.play().catch(() => restoreBackground());
}

export function setGameSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('dice-roll-sound', enabled ? 'on' : 'off');
  } catch {
    // Storage may be unavailable in private browsing mode.
  }
  if (enabled && active) startGameMusic();
  if (!enabled) {
    background?.pause();
    dice?.pause();
    restoreBackground();
  }
}
