/**
 * app.ts
 * アプリケーションのメインロジック。
 * - 設定画面 ↔ プレゼン画面の切り替え
 * - ページ制御（自動・手動）
 * - タイマーとの連携
 */

import { PdfLoader } from './pdf-loader'
import { PresentationTimer } from './timer'

const STORAGE_KEY_SECONDS = 'autopresen_total_seconds'

export class App {
  // --- 設定画面 DOM ---
  private setupScreen = document.getElementById('setup-screen')!
  private presentScreen = document.getElementById('present-screen')!
  private pdfInput = document.getElementById('pdf-input') as HTMLInputElement
  private fileNameDisplay = document.getElementById('file-name-display')!
  private totalPagesInput = document.getElementById('total-pages') as HTMLInputElement
  private totalSecondsInput = document.getElementById('total-seconds') as HTMLInputElement
  private perPageInfo = document.getElementById('per-page-info')!
  private perPageSeconds = document.getElementById('per-page-seconds')!
  private startBtn = document.getElementById('start-btn') as HTMLButtonElement

  // --- プレゼン画面 DOM ---
  private pdfCanvas = document.getElementById('pdf-canvas') as HTMLCanvasElement
  private loadingOverlay = document.getElementById('loading-overlay')!
  private prevBtn = document.getElementById('prev-btn') as HTMLButtonElement
  private pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement
  private nextBtn = document.getElementById('next-btn') as HTMLButtonElement
  private backBtn = document.getElementById('back-btn') as HTMLButtonElement
  private remainingTime = document.getElementById('remaining-time')!
  private currentPageNum = document.getElementById('current-page-num')!
  private totalPageNum = document.getElementById('total-page-num')!
  private progressBar = document.getElementById('progress-bar')!
  private finishOverlay = document.getElementById('finish-overlay')!
  private finishBackBtn = document.getElementById('finish-back-btn') as HTMLButtonElement

  // --- 状態 ---
  private pdfLoader = new PdfLoader()
  private timer: PresentationTimer
  private pdfData: ArrayBuffer | null = null
  private totalPages: number = 0
  private totalMs: number = 0
  private msPerPage: number = 0
  private currentPage: number = 1
  private finished: boolean = false

  constructor() {
    this.timer = new PresentationTimer((elapsed) => this.onTick(elapsed))
    this.restoreSettings()
    this.bindSetupEvents()
    this.bindPresentEvents()
  }

  // --------------------------------------------------------
  // 設定画面
  // --------------------------------------------------------

  private bindSetupEvents(): void {
    this.pdfInput.addEventListener('change', () => this.onFileSelected())
    this.totalSecondsInput.addEventListener('input', () => this.updatePerPageInfo())
    this.startBtn.addEventListener('click', () => this.startPresentation())
  }

  private async onFileSelected(): Promise<void> {
    const file = this.pdfInput.files?.[0]
    if (!file) return

    this.fileNameDisplay.textContent = file.name
    this.startBtn.disabled = true
    this.setLoading(true)

    try {
      this.pdfData = await file.arrayBuffer()
      this.totalPages = await this.pdfLoader.load(this.pdfData)
      this.totalPagesInput.value = String(this.totalPages)
      this.updatePerPageInfo()
      this.startBtn.disabled = false
    } catch (err) {
      console.error('PDF の読み込みに失敗しました:', err)
      alert('PDF の読み込みに失敗しました。別のファイルを試してください。')
    } finally {
      this.setLoading(false)
    }
  }

  private updatePerPageInfo(): void {
    const seconds = Number(this.totalSecondsInput.value)
    const pages = this.totalPages
    if (pages > 0 && seconds > 0) {
      const perPage = seconds / pages
      this.perPageSeconds.textContent = perPage.toFixed(1)
      this.perPageInfo.hidden = false
    } else {
      this.perPageInfo.hidden = true
    }
  }

  private restoreSettings(): void {
    const saved = localStorage.getItem(STORAGE_KEY_SECONDS)
    if (saved) {
      this.totalSecondsInput.value = saved
    }
  }

  private saveSettings(): void {
    localStorage.setItem(STORAGE_KEY_SECONDS, this.totalSecondsInput.value)
  }

  // --------------------------------------------------------
  // プレゼン開始
  // --------------------------------------------------------

  private async startPresentation(): Promise<void> {
    if (!this.pdfData) return

    this.saveSettings()
    const seconds = Number(this.totalSecondsInput.value)
    this.totalMs = seconds * 1000
    this.msPerPage = this.totalMs / this.totalPages
    this.currentPage = 1
    this.finished = false
    this.finishOverlay.hidden = true

    // 画面切り替え
    this.setupScreen.classList.remove('active')
    this.presentScreen.classList.add('active')

    this.totalPageNum.textContent = String(this.totalPages)
    this.pauseBtn.textContent = '⏸'

    // 最初のページを描画してからタイマー開始
    this.setLoading(true)
    await this.pdfLoader.renderPage(1, this.pdfCanvas)
    this.updateUI(0)
    this.setLoading(false)

    this.timer.start()
  }

  // --------------------------------------------------------
  // プレゼン画面
  // --------------------------------------------------------

  private bindPresentEvents(): void {
    this.prevBtn.addEventListener('click', () => this.manualPageChange(-1))
    this.nextBtn.addEventListener('click', () => this.manualPageChange(+1))
    this.pauseBtn.addEventListener('click', () => this.togglePause())
    this.backBtn.addEventListener('click', () => this.returnToSetup())
    this.finishBackBtn.addEventListener('click', () => this.returnToSetup())
  }

  private onTick(elapsed: number): void {
    if (this.finished) return

    // 経過時間からあるべきページを計算
    const targetPage = Math.min(
      Math.floor(elapsed / this.msPerPage) + 1,
      this.totalPages
    )

    if (targetPage !== this.currentPage) {
      this.goToPage(targetPage)
    }

    this.updateUI(elapsed)

    // 全ページ表示完了（最終ページの表示時間も消化したら終了）
    if (elapsed >= this.totalMs) {
      this.finish()
    }
  }

  private async goToPage(pageNum: number): Promise<void> {
    this.currentPage = pageNum
    this.setLoading(true)
    try {
      await this.pdfLoader.renderPage(pageNum, this.pdfCanvas)
    } finally {
      this.setLoading(false)
    }
  }

  private updateUI(elapsed: number): void {
    // 残り時間（秒）
    const remainingMs = Math.max(0, this.totalMs - elapsed)
    const remainingSec = remainingMs / 1000
    this.remainingTime.textContent = remainingSec.toFixed(1)

    // ページ番号
    this.currentPageNum.textContent = String(this.currentPage)

    // プログレスバー
    const progress = Math.min(elapsed / this.totalMs, 1) * 100
    this.progressBar.style.width = `${progress}%`
  }

  private async manualPageChange(delta: number): Promise<void> {
    const newPage = this.currentPage + delta
    if (newPage < 1 || newPage > this.totalPages) return
    await this.goToPage(newPage)
    this.currentPageNum.textContent = String(this.currentPage)
  }

  private togglePause(): void {
    if (this.timer.isPaused) {
      this.timer.resume()
      this.pauseBtn.textContent = '⏸'
      this.pauseBtn.classList.remove('ctrl-btn--paused')
    } else {
      this.timer.pause()
      this.pauseBtn.textContent = '▶'
      this.pauseBtn.classList.add('ctrl-btn--paused')
    }
  }

  private finish(): void {
    this.finished = true
    this.timer.stop()
    this.finishOverlay.hidden = false
  }

  private returnToSetup(): void {
    this.timer.stop()
    this.finished = false
    this.finishOverlay.hidden = true
    this.presentScreen.classList.remove('active')
    this.setupScreen.classList.add('active')
  }

  // --------------------------------------------------------
  // ユーティリティ
  // --------------------------------------------------------

  private setLoading(show: boolean): void {
    this.loadingOverlay.hidden = !show
  }
}
