/**
 * One shared mixer for the whole browser tab. Audio continues across turns
 * and React screen re-renders without creating overlapping players.
 */
/** Nhạc nền (đã hạ hai lần theo yêu cầu: 0,3 → 0,09 → 0,045). */
const BACKGROUND_VOLUME = 0.045;
/** Nhạc nền khi có người đang bật mic nói chuyện. */
const VOICE_VOLUME = 0.009;
/** Nhạc nền lúc xúc xắc đang lăn. */
const DUCKED_VOLUME = 0.003;
const DICE_VOLUME = 1;
const STEP_VOLUME = 0.8;
const COIN_VOLUME = 0.9;
const LINE_VOLUME = 1;
/** Mỗi bước 0,2 giây mà tiếng dài 0,6 giây: vài bản phát chồng lên nhau. */
const STEP_POOL = 4;

let background: HTMLAudioElement | null = null;
let dice: HTMLAudioElement | null = null;
let coins: HTMLAudioElement | null = null;
const steps: HTMLAudioElement[] = [];
let nextStep = 0;
let active = false;
let voiceDucked = false;

const baseVolume = (): number => (voiceDucked ? VOICE_VOLUME : BACKGROUND_VOLUME);

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

function restoreBackground(): void {
  if (background && (!dice || dice.paused || dice.ended)) background.volume = baseVolume();
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
  unlockSpeech();
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

/** Tiếng tiền rơi leng keng (mua đất, xây nhà). */
export function playCoinSound(): void {
  if (!active || !canPlay()) return;
  if (!coins) {
    coins = new Audio('/tien-roi.mp3');
    coins.preload = 'auto';
    coins.volume = COIN_VOLUME;
  }
  coins.currentTime = 0;
  void coins.play().catch(() => {});
}

const lineAudio = new Map<string, HTMLAudioElement>();
const brokenFiles = new Set<string>();

/**
 * Câu nói ngắn khi quân đến ô: phát file giọng đã thu sẵn; file lỗi thì đọc `text` bằng giọng
 * tiếng Việt có sẵn trên máy (máy không có giọng tiếng Việt thì im lặng).
 */
export function sayLine(text: string, file?: string): void {
  if (!active || !canPlay()) return;
  if (file && !brokenFiles.has(file)) {
    let a = lineAudio.get(file);
    if (!a) {
      a = new Audio(file);
      a.preload = 'auto';
      a.volume = LINE_VOLUME;
      lineAudio.set(file, a);
    }
    for (const other of lineAudio.values()) if (other !== a) other.pause();
    a.currentTime = 0;
    const played = a.play();
    void played.catch((err: unknown) => {
      // Trình duyệt chặn tự phát (chưa chạm trang) thì thôi; file hỏng thì đọc bằng giọng máy.
      if (err instanceof DOMException && err.name === 'NotAllowedError') return;
      brokenFiles.add(file);
      speak(text);
    });
    return;
  }
  speak(text);
}

function speak(text: string): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  const voice = vietnameseVoice();
  if (!synth || !voice) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1.05;
  u.pitch = 1.1;
  u.volume = 1;
  synth.speak(u);
}

function vietnameseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const vi = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('vi'));
  // Ưu tiên giọng có sẵn trên máy (không cần mạng), rồi tới giọng của trình duyệt.
  return vi.find((v) => v.localService) ?? vi[0] ?? null;
}

let speechUnlocked = false;
/** iOS chỉ cho đọc sau một lần chạm: đọc một câu rỗng ngay trong lần chạm đầu tiên. */
function unlockSpeech(): void {
  if (speechUnlocked || typeof window === 'undefined' || !window.speechSynthesis) return;
  speechUnlocked = true;
  // Gọi để trình duyệt nạp danh sách giọng sớm.
  window.speechSynthesis.getVoices();
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
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
    coins?.pause();
    for (const a of lineAudio.values()) a.pause();
    window.speechSynthesis?.cancel();
    for (const a of steps) a.pause();
    restoreBackground();
  }
}
