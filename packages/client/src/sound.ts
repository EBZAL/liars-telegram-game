/**
 * Procedural Web Audio API sound effects for Liar's Deck.
 * Zero external audio assets, zero network latency, 100% reliable on all platforms.
 */

class SoundSystem {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private bgmAudio: HTMLAudioElement | null = null;
  private shotAudio: HTMLAudioElement | null = null;
  private bgmPlaying: boolean = true;
  private bgmVolume: number = 0.35; // Background volume (so SFX remain prominent)

  constructor() {
    this.muted = false;
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private getBgmAudio(url: string = '/bgm.mp3'): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.bgmAudio) {
      const existing = document.getElementById('bgm-audio') as HTMLAudioElement | null;
      if (existing) {
        this.bgmAudio = existing;
      } else {
        try {
          this.bgmAudio = new Audio(url);
          this.bgmAudio.loop = true;
          this.bgmAudio.volume = this.bgmVolume;
          this.bgmAudio.setAttribute('playsinline', 'true');
        } catch {
          return null;
        }
      }
    }
    return this.bgmAudio;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    const audio = this.getBgmAudio();
    if (audio) {
      if (this.muted) {
        audio.pause();
      } else if (this.bgmPlaying) {
        audio.play().catch(() => {});
      }
    }
  }

  /**
   * Starts playing looping background ambient music
   */
  public playBgm(url: string = '/bgm.mp3'): void {
    if (typeof window === 'undefined') return;
    this.bgmPlaying = true;

    const audio = this.getBgmAudio(url);
    if (!audio) return;

    audio.volume = this.bgmVolume;
    audio.loop = true;

    if (!this.muted && audio.paused) {
      audio.play().catch(() => {
        // Autoplay may wait for user interaction
      });
    }
  }

  public pauseBgm(): void {
    this.bgmPlaying = false;
    const audio = this.getBgmAudio();
    if (audio) {
      audio.pause();
    }
  }

  private getShotAudio(url: string = '/shot.wav'): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.shotAudio) {
      const existing = document.getElementById('shot-audio') as HTMLAudioElement | null;
      if (existing) {
        this.shotAudio = existing;
      } else {
        try {
          this.shotAudio = new Audio(url);
          this.shotAudio.preload = 'auto';
        } catch {
          return null;
        }
      }
    }
    return this.shotAudio;
  }

  public setBgmVolume(volume: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    const audio = this.getBgmAudio();
    if (audio) {
      audio.volume = this.bgmVolume;
    }
  }

  /**
   * Ducks background music volume during high-suspense roulette moments
   */
  public duckBgm(targetVolume: number = 0.04): void {
    const audio = this.getBgmAudio();
    if (audio) {
      audio.volume = targetVolume;
    }
  }

  /**
   * Restores background music volume to default level
   */
  public restoreBgm(): void {
    const audio = this.getBgmAudio();
    if (audio) {
      audio.volume = this.bgmVolume;
    }
  }

  /**
   * Subtle card selection snap
   */
  public playCardSelect(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {}
  }

  /**
   * Card deal / play onto the table: soft thud
   */
  public playCardPlay(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch {}
  }

  /**
   * Dramatic CALL LIAR suspense horn / chord
   */
  public playLiarCall(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = [370, 523]; // F#4 and C5 (tritone suspense)

      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(250, now + 0.45);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
      });
    } catch {}
  }

  /**
   * Revolver CLICK: hammer hits empty cylinder (mechanical metal click)
   */
  public playGunClick(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. High metal ping
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.06);

      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);

      // 2. Mechanical noise latch
      const bufferSize = ctx.sampleRate * 0.03;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3200, now);
      filter.Q.setValueAtTime(6, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      whiteNoise.start(now);
    } catch {}
  }

  /**
   * Revolver BANG: plays the authentic user gunshot sound (/shot.wav) + tinnitus ear ringing
   */
  public playGunBang(url: string = '/shot.wav'): void {
    if (this.muted) return;

    // 1. Play authentic gunshot audio file
    const isTest = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
    if (!isTest) {
      const audio = this.getShotAudio(url);
      if (audio && typeof audio.play === 'function') {
        try {
          audio.currentTime = 0;
          audio.volume = 1.0;
          const p = audio.play();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
        } catch {}
      }
    }

    // 2. Synthesize sub-bass punch and tinnitus
    const ctx = this.getContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(100, now);
        sub.frequency.exponentialRampToValueAtTime(25, now + 0.4);
        subGain.gain.setValueAtTime(0.5, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start(now);
        sub.stop(now + 0.4);

        this.playTinnitus();
      } catch {}
    }
  }

  /**
   * Suspenseful Heartbeat pulse (Lub-Dub)
   */
  public playHeartbeat(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Lub
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(80, now);
      osc1.frequency.exponentialRampToValueAtTime(32, now + 0.12);
      gain1.gain.setValueAtTime(0.5, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Dub
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(65, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(28, now + 0.28);
      gain2.gain.setValueAtTime(0.38, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.28);
    } catch {}
  }

  /**
   * Mechanical Revolver Cylinder spin (ratchet clicks)
   */
  public playCylinderSpin(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const clicks = 8;
      for (let i = 0; i < clicks; i++) {
        const clickTime = now + i * 0.08 + i * i * 0.012;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1300 + Math.random() * 250, clickTime);
        osc.frequency.exponentialRampToValueAtTime(350, clickTime + 0.025);
        gain.gain.setValueAtTime(0.22, clickTime);
        gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.025);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(clickTime);
        osc.stop(clickTime + 0.025);
      }
    } catch {}
  }

  /**
   * Revolver hammer cocking sound
   */
  public playHammerCock(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(950, now);
      osc1.frequency.exponentialRampToValueAtTime(380, now + 0.04);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.04);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(600, now + 0.07);
      osc2.frequency.exponentialRampToValueAtTime(200, now + 0.16);
      gain2.gain.setValueAtTime(0.35, now + 0.07);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.07);
      osc2.stop(now + 0.16);
    } catch {}
  }

  /**
   * Ear ringing tinnitus whistle
   */
  public playTinnitus(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3800, now);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.4);
    } catch {}
  }

  /**
   * Relief chime when player survives
   */
  public playRelief(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [440, 554.37, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.16, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.6);
      });
    } catch {}
  }

  /**
   * Victory celebratory fanfare
   */
  public playVictory(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 523.25, time: 0.00, dur: 0.12 }, // C5
        { freq: 659.25, time: 0.12, dur: 0.12 }, // E5
        { freq: 783.99, time: 0.24, dur: 0.14 }, // G5
        { freq: 1046.50, time: 0.38, dur: 0.45 }, // C6
      ];

      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0.2, now + time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    } catch {}
  }

  /**
   * Elimination dark gong / descending minor
   */
  public playElimination(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.7);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch {}
  }
}

export const soundManager = new SoundSystem();
