export type AlarmTone = 'braun' | 'chime' | 'pulse';

export interface AlarmToneOption {
  id: AlarmTone;
  label: string;
  description: string;
}

export const ALARM_TONES: AlarmToneOption[] = [
  {
    id: 'braun',
    label: 'Кварц ET66',
    description: 'Классический четкий электронный сигнал',
  },
  {
    id: 'chime',
    label: 'Аккорд Дзен',
    description: 'Мягкий гармонический колокольный перезвон',
  },
  {
    id: 'pulse',
    label: 'Импульс',
    description: 'Ритмичный студийный синтезаторный сигнал',
  },
];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private alarmInterval: number | null = null;
  private alarmTimeout: number | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playClick(variant: 'soft' | 'step' | 'start' | 'pause' | 'reset' = 'soft', muted = false) {
    if (muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (variant === 'start') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.065);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.075);
    } else if (variant === 'pause') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.06);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (variant === 'reset') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.055);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.065);
    } else if (variant === 'step') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.022);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.start(now);
      osc.stop(now + 0.028);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.018);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
      osc.start(now);
      osc.stop(now + 0.022);
    }
  }

  public playCountdownTick(secondsLeft: number, muted = false) {
    if (muted || secondsLeft > 5 || secondsLeft <= 0) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Pitch rises slightly on final second
    const freq = secondsLeft === 1 ? 1320 : 987.77;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playAlarmPattern(tone: AlarmTone = 'braun') {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (tone === 'braun') {
      // Iconic 4-beep high-precision digital quartz pattern
      const offsets = [0, 0.12, 0.24, 0.36];
      offsets.forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(2048, now + offset);

        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.linearRampToValueAtTime(0.11, now + offset + 0.006);
        gain.gain.setValueAtTime(0.11, now + offset + 0.065);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + offset + 0.085);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.09);
      });
    } else if (tone === 'chime') {
      // Warm harmonic bell chord (C5, E5, G5, B5, D6)
      const freqs = [523.25, 659.25, 783.99, 987.77, 1174.66];
      freqs.forEach((freq, idx) => {
        const start = now + idx * 0.075;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.12 / Math.sqrt(idx + 1), start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.85);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.88);
      });
    } else if (tone === 'pulse') {
      // Studio dual-octave warm synth pulse
      const notes = [
        { freq: 587.33, offset: 0, dur: 0.14 },
        { freq: 880.0, offset: 0.16, dur: 0.14 },
        { freq: 1174.66, offset: 0.32, dur: 0.28 },
      ];
      notes.forEach(({ freq, offset, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + offset);

        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.linearRampToValueAtTime(0.16, now + offset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + dur + 0.02);
      });
    }
  }

  public startAlarmLoop(tone: AlarmTone = 'braun', muted = false) {
    this.stopAlarmLoop();
    if (muted) return;

    this.playAlarmPattern(tone);
    const intervalMs = tone === 'chime' ? 1500 : 1100;

    this.alarmInterval = window.setInterval(() => {
      this.playAlarmPattern(tone);
    }, intervalMs);

    // Auto stop after 25 seconds so it doesn't ring forever if user walked away
    this.alarmTimeout = window.setTimeout(() => {
      this.stopAlarmLoop();
    }, 25000);
  }

  public stopAlarmLoop() {
    if (this.alarmInterval !== null) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
    if (this.alarmTimeout !== null) {
      clearTimeout(this.alarmTimeout);
      this.alarmTimeout = null;
    }
  }
}

export const soundEngine = new SoundEngine();
