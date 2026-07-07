export type ImpactSoundKind = 'stick' | 'scorch' | 'dent' | 'made' | 'bounce'

export class GameSounds {
  private ctx: AudioContext | null = null
  private noiseBuffer: AudioBuffer | null = null

  playLaunch(velocity: number): void {
    const ctx = this.ensureContext()

    if (!ctx) {
      return
    }

    const strength = Math.max(0.2, Math.min(1, velocity / 4))
    const noise = this.createNoiseSource(ctx)

    if (!noise) {
      return
    }

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(600, ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.16)
    filter.Q.value = 1.4

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16 * strength, ctx.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2)

    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start()
    noise.stop(ctx.currentTime + 0.22)
  }

  playImpact(kind: ImpactSoundKind, points = 0): void {
    const ctx = this.ensureContext()

    if (!ctx) {
      return
    }

    switch (kind) {
      case 'stick':
        this.playThud(ctx, 190, 0.24)
        break
      case 'dent':
        this.playThud(ctx, 320, 0.18)
        break
      case 'scorch':
        this.playScorch(ctx)
        break
      case 'made':
        this.playSwish(ctx)
        break
      case 'bounce':
        this.playThud(ctx, 150, 0.3)
        break
    }

    if (points >= 50) {
      this.playDing(ctx)
    }
  }

  dispose(): void {
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.noiseBuffer = null
  }

  private ensureContext(): AudioContext | null {
    const Constructor = typeof window === 'undefined' ? undefined : window.AudioContext

    if (!Constructor) {
      return null
    }

    try {
      this.ctx ??= new Constructor()

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {})
      }

      return this.ctx
    } catch {
      return null
    }
  }

  private createNoiseSource(ctx: AudioContext): AudioBufferSourceNode | null {
    try {
      if (!this.noiseBuffer) {
        const length = Math.floor(ctx.sampleRate * 0.4)
        this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate)
        const data = this.noiseBuffer.getChannelData(0)

        for (let index = 0; index < length; index += 1) {
          data[index] = Math.random() * 2 - 1
        }
      }

      const source = ctx.createBufferSource()
      source.buffer = this.noiseBuffer
      return source
    } catch {
      return null
    }
  }

  private playThud(ctx: AudioContext, frequency: number, duration: number): void {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.4), ctx.currentTime + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.22, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)

    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration + 0.02)
  }

  private playScorch(ctx: AudioContext): void {
    const noise = this.createNoiseSource(ctx)

    if (!noise) {
      return
    }

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(3200, ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.28)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)

    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start()
    noise.stop(ctx.currentTime + 0.32)
  }

  private playSwish(ctx: AudioContext): void {
    const noise = this.createNoiseSource(ctx)

    if (!noise) {
      return
    }

    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(1400, ctx.currentTime)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34)

    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start()
    noise.stop(ctx.currentTime + 0.36)
  }

  private playDing(ctx: AudioContext): void {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.06)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + 0.06)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.09)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)

    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + 0.06)
    osc.stop(ctx.currentTime + 0.52)
  }
}
