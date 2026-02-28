/**
 * timer.ts
 * iOS Safari 対応の高精度タイマー。
 * - Date.now() ベースで setInterval のドリフトを回避
 * - visibilitychange でバックグラウンド中の経過時間を除外
 * - Wake Lock API でスリープを防止
 */

export type TimerCallback = (elapsed: number) => void

export class PresentationTimer {
  private startTime: number = 0
  private totalPausedMs: number = 0
  private pauseStart: number | null = null
  private rafId: number | null = null
  private wakeLock: WakeLockSentinel | null = null
  private onTick: TimerCallback
  private running: boolean = false

  constructor(onTick: TimerCallback) {
    this.onTick = onTick
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this)
  }

  /** タイマーを開始する */
  start(): void {
    this.startTime = Date.now()
    this.totalPausedMs = 0
    this.pauseStart = null
    this.running = true
    this.acquireWakeLock()
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.tick()
  }

  /** 一時停止 */
  pause(): void {
    if (!this.running || this.pauseStart !== null) return
    this.pauseStart = Date.now()
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /** 再開 */
  resume(): void {
    if (this.running || this.pauseStart === null) return
    this.totalPausedMs += Date.now() - this.pauseStart
    this.pauseStart = null
    this.running = true
    this.tick()
  }

  /** タイマーを停止・リセット */
  stop(): void {
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.releaseWakeLock()
  }

  /** 現在の経過時間（ms）を取得 */
  getElapsed(): number {
    if (!this.running && this.pauseStart === null) return 0
    const now = this.pauseStart !== null ? this.pauseStart : Date.now()
    return now - this.startTime - this.totalPausedMs
  }

  get isPaused(): boolean {
    return !this.running
  }

  private tick(): void {
    if (!this.running) return
    const elapsed = Date.now() - this.startTime - this.totalPausedMs
    this.onTick(elapsed)
    this.rafId = requestAnimationFrame(() => this.tick())
  }

  /** 画面ロック / タブ非表示のタイミングを補正する */
  private handleVisibilityChange(): void {
    if (document.hidden) {
      // バックグラウンドへ移行: 一時停止と同じ処理
      if (this.running && this.pauseStart === null) {
        this.pauseStart = Date.now()
        this.running = false
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId)
          this.rafId = null
        }
      }
    } else {
      // フォアグラウンドへ復帰
      if (!this.running && this.pauseStart !== null) {
        this.totalPausedMs += Date.now() - this.pauseStart
        this.pauseStart = null
        this.running = true
        this.tick()
      }
    }
  }

  /** Wake Lock 取得（iOS 16.4+ 対応、非対応環境は無視） */
  private async acquireWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen')
      }
    } catch {
      // 非対応環境では無視する
    }
  }

  private async releaseWakeLock(): Promise<void> {
    try {
      if (this.wakeLock) {
        await this.wakeLock.release()
        this.wakeLock = null
      }
    } catch {
      // 無視する
    }
  }
}
