/**
 * One shared mixer for the whole browser tab. Audio continues across turns
 * and React screen re-renders without creating overlapping players.
 */
/** Nhạc nền: 30% mức cũ (0,3) theo yêu cầu. */
const BACKGROUND_VOLUME = 0.09;
/** Nhạc nền khi có người đang bật mic nói chuyện (cũng 30% mức cũ). */
const VOICE_VOLUME = 0.018;
/** Nhạc nền lúc xúc xắc đang lăn. */
const DUCKED_VOLUME = 0.005;
const DICE_VOLUME = 1;
const STEP_VOLUME = 0.8;
/** Mỗi bước 0,2 giây mà tiếng dài 0,6 giây: vài bản phát chồng lên nhau. */
const STEP_POOL = 4;
/** Câu thoại (không phải tiếng mic): to hơn nhạc nền để nghe rõ lời. */
const SPEECH_VOLUME = 1;

/** Câu thoại theo tình huống trong ván. */
export type SpeechLine = 'jail' | 'rent' | 'tax';

const SPEECH_SRC: Record<SpeechLine, string> = {
  /** Bị vào tù: "Vào tù là rõ". */
  jail: '/vao-tu-la-ro.mp3',
  /** Phải trả tiền thuê cho người khác: "Ôi thôi chết". */
  rent: '/oi-thoi-chet.mp3',
  /** Dừng ở ô thuế, phải bấm "Là nó". */
  tax: '/la-no.mp3',
};

let background: HTMLAudioElement | null = null;
let dice: HTMLAudioElement | null = null;
const steps: HTMLAudioElement[] = [];
const speeches = new Map<SpeechLine, HTMLAudioElement>();
let nextStep = 0;
let active = false;
let voiceDucked = false;

const baseVolume = (): number => (voiceDucked ? VOICE_VOLUME : BACKGROUND_VOLUME);

const playing = (sound: HTMLAudioElement | null): boolean =>
  sound !== null && !sound.paused && !sound.ended;

function getBackground(): HTMLAudioElement {
  if (!background) {
    background = new Audio('/background.mp3');
    background.loop = true;
    background.preload = 'auto';
    background.volume = baseVolume();
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

function getSpeech(kind: SpeechLine): HTMLAudioElement {
  let sound = speeches.get(kind);
  if (!sound) {
    sound = new Audio(SPEECH_SRC[kind]);
    sound.preload = 'auto';
    sound.volume = SPEECH_VOLUME;
    sound.addEventListener('ended', restoreBackground);
    sound.addEventListener('pause', restoreBackground);
    sound.addEventListener('error', restoreBackground);
    speeches.set(kind, sound);
  }
  return sound;
}

function restoreBackground(): void {
  if (!background || playing(dice)) return;
  for (const sound of speeches.values()) if (playing(sound)) return;
  background.volume = baseVolume();
}

/** Có người bật mic: nhạc nền nhỏ lại để nghe rõ tiếng nói. */
export function setVoiceDucking(on: boolean): void {
  voiceDucked = on;
  restoreBackground();
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
  for (const sound of speeches.values()) sound.pause();
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

/** Tiếng một bước nhảy của quân cờ (mỗi ô đi qua phát một lần). */
export function playStepSound(): void {
  if (!active || !canPlay()) return;
  if (steps.length < STEP_POOL) {
    const a = new Audio('/buoc-nhay.mp3');
    a.preload = 'auto';
    a.volume = STEP_VOLUME;
    steps.push(a);
  }
  const sound = steps[nextStep % steps.length]!;
  nextStep += 1;
  sound.currentTime = 0;
  void sound.play().catch(() => {});
}

/**
 * Câu thoại cho tình huống vừa xảy ra. Chỉ một câu phát cùng lúc, nhạc nền nhỏ lại trong lúc nói.
 */
export function playSpeech(kind: SpeechLine): void {
  if (!active || !canPlay()) return;
  for (const [other, sound] of speeches) if (other !== kind) sound.pause();
  const sound = getSpeech(kind);
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
    for (const a of steps) a.pause();
    for (const sound of speeches.values()) sound.pause();
    restoreBackground();
  }
}
