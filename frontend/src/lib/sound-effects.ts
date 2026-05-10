type SoundEvent = "click" | "success" | "danger" | "validation" | "import";

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
};

let audioContext: AudioContext | null = null;

export const isSoundEnabled = () => localStorage.getItem("sound-effects-enabled") !== "false";

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
  if (typeof window === "undefined" || !isSoundEnabled()) return;
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
    oscillator.type = event === "danger" ? "sawtooth" : preset.wave;
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
