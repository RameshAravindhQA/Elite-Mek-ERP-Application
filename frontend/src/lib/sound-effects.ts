export type SoundEvent = 
  | "click" 
  | "success" 
  | "danger" 
  | "validation" 
  | "import"
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout";

type SoundPreset = {
  name: string;
  wave: OscillatorType;
  notes: number[];
  duration: number;
  gain: number;
};

export const SOUND_PRESETS: SoundPreset[] = [
  { name: "Crystal", wave: "sine", notes: [880, 1174], duration: 0.1, gain: 0.11 },
  { name: "Soft Bell", wave: "sine", notes: [659, 988, 1318], duration: 0.11, gain: 0.1 },
  { name: "Digital", wave: "square", notes: [740, 980], duration: 0.07, gain: 0.07 },
  { name: "Pulse", wave: "triangle", notes: [392, 784], duration: 0.095, gain: 0.1 },
  { name: "Chime", wave: "sine", notes: [523, 659, 1046], duration: 0.1, gain: 0.1 },
  { name: "Glass", wave: "sine", notes: [1200, 1600], duration: 0.075, gain: 0.08 },
  { name: "Warm Tap", wave: "triangle", notes: [330, 440], duration: 0.09, gain: 0.11 },
  { name: "Arcade", wave: "square", notes: [523, 784, 1046], duration: 0.07, gain: 0.065 },
  { name: "Minimal", wave: "sine", notes: [700], duration: 0.07, gain: 0.08 },
  { name: "Executive", wave: "triangle", notes: [494, 740, 988], duration: 0.095, gain: 0.1 },
];

const EVENT_PATTERN: Record<SoundEvent, number[]> = {
  click: [1],
  success: [0, 1, 2],
  danger: [2, 1, 0],
  validation: [0, 0],
  import: [0, 2, 1],
  create: [0, 1, 2, 1],
  update: [1, 2, 1, 2],
  delete: [2, 1, 0, 1],
  login: [0, 2, 1, 2, 0],
  logout: [2, 1, 0, 1, 0],
};

let audioContext: AudioContext | null = null;
const activeCustomAudio = new Set<HTMLAudioElement>();

const getBaseUrl = () => {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalized}/api`;
};

const getSoundPayload = () => {
  const events = SOUND_EVENTS.reduce((acc, event) => {
    acc[event] = localStorage.getItem(`sound-effects-${event}-enabled`) !== "false";
    return acc;
  }, {} as Record<SoundEvent, boolean>);
  const customSounds = SOUND_EVENTS.reduce((acc, event) => {
    const stored = localStorage.getItem(`sound-custom-${event}`);
    if (stored) {
      try {
        acc[event] = JSON.parse(stored);
      } catch {
        localStorage.removeItem(`sound-custom-${event}`);
      }
    }
    return acc;
  }, {} as Record<string, { url: string; name: string }>);
  return {
    enabled: isSoundEnabled(),
    preset: localStorage.getItem("sound-effects-preset") || "0",
    events,
    customSounds,
  };
};

export const SOUND_EVENTS: SoundEvent[] = ["click", "success", "danger", "validation", "import", "create", "update", "delete", "login", "logout"];

export async function syncSoundSettingsToServer() {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("token");
  if (!token) return;
  const response = await fetch(`${getBaseUrl()}/settings/sounds`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(getSoundPayload()),
  });
  if (!response.ok) {
    throw new Error(`Sound settings sync failed (${response.status})`);
  }
}

export async function loadSoundSettingsFromServer() {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("token");
  if (!token) return;
  const response = await fetch(`${getBaseUrl()}/settings/sounds`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return;
  const settings = await response.json();
  localStorage.setItem("sound-effects-enabled", String(settings.enabled !== false));
  localStorage.setItem("sound-effects-preset", String(settings.preset || "0"));
  for (const event of SOUND_EVENTS) {
    if (settings.events?.[event] !== undefined) {
      localStorage.setItem(`sound-effects-${event}-enabled`, settings.events[event] ? "true" : "false");
    }
    if (settings.customSounds?.[event]?.url) {
      localStorage.setItem(`sound-custom-${event}`, JSON.stringify(settings.customSounds[event]));
    }
  }
}

// Custom sound storage functions
export const getCustomSoundUrl = (event: SoundEvent): string | null => {
  const key = `sound-custom-${event}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored).url || null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

export const setCustomSoundUrl = (event: SoundEvent, file: File): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      localStorage.setItem(`sound-custom-${event}`, JSON.stringify({ url: dataUrl, name: file.name }));
      resolve();
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

export const getCustomSoundName = (event: SoundEvent): string | null => {
  const key = `sound-custom-${event}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored).name || null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

export const clearCustomSound = (event: SoundEvent): void => {
  localStorage.removeItem(`sound-custom-${event}`);
};

export const isSoundEnabled = () => localStorage.getItem("sound-effects-enabled") !== "false";

export const isSoundEventEnabled = (event: SoundEvent): boolean => {
  if (!isSoundEnabled()) return false;
  const key = `sound-effects-${event}-enabled`;
  // Default to true for all events if not explicitly disabled
  return localStorage.getItem(key) !== "false";
};

export const setSoundEventEnabled = (event: SoundEvent, enabled: boolean): void => {
  localStorage.setItem(`sound-effects-${event}-enabled`, enabled ? "true" : "false");
};

export const getSoundEventPreference = (event: SoundEvent): boolean => {
  return isSoundEventEnabled(event);
};

const getPreset = () => {
  const index = Number(localStorage.getItem("sound-effects-preset") || "0");
  return SOUND_PRESETS[index] || SOUND_PRESETS[0];
};

function getAudioContext() {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

export async function playSound(event: SoundEvent = "click") {
  if (typeof window === "undefined" || !isSoundEventEnabled(event)) return;
  
  // Check for custom sound first
  const customSoundUrl = getCustomSoundUrl(event);
  if (customSoundUrl) {
    try {
      const audio = new Audio(customSoundUrl);
      audio.preload = "auto";
      audio.volume = 0.85;
      activeCustomAudio.add(audio);
      const cleanup = () => activeCustomAudio.delete(audio);
      audio.addEventListener("ended", cleanup, { once: true });
      audio.addEventListener("error", cleanup, { once: true });
      await audio.play();
      window.setTimeout(cleanup, 5000);
      return;
    } catch (err) {
      console.error(`Failed to play custom sound for ${event}:`, err);
    }
  }

  // Fall back to generated sound
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  const preset = getPreset();
  const pattern = EVENT_PATTERN[event] || EVENT_PATTERN.click;
  const startedAt = ctx.currentTime + 0.015;

  pattern.forEach((noteIndex, index) => {
    const frequency = preset.notes[noteIndex % preset.notes.length];
    const start = startedAt + index * (preset.duration + 0.025);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = event === "danger" || event === "delete" ? "sawtooth" : preset.wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(preset.gain, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + preset.duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + preset.duration + 0.02);
  });
}

export function installGlobalClickSound() {
  if (typeof window === "undefined") return () => {};
  const handler = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("button,a,[role='button'],[data-sound-click]")) return;
    void playSound("click");
  };
  document.addEventListener("click", handler, true);
  return () => document.removeEventListener("click", handler, true);
}
