/**
 * pdf-loader.ts
 * PDF.js ラッパー。
 * - ArrayBuffer から PDF をロード
 * - 指定ページを Canvas に描画
 * - 前後ページをプリロードして描画遅延を防止
 */

import * as pdfjsLib from 'pdfjs-dist'

// pdfjs-dist のワーカースクリプトを CDN から取得（Vite バンドル対策）
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

/** プリロードするページ数（現在ページの前後） */
const PRELOAD_RANGE = 2

export class PdfLoader {
  private pdf: pdfjsLib.PDFDocumentProxy | null = null
  /** ページ番号 → 描画済み ImageBitmap のキャッシュ */
  private cache: Map<number, ImageBitmap> = new Map()
  private renderingPages: Set<number> = new Set()

  /** PDF をロードしてページ数を返す */
  async load(data: ArrayBuffer): Promise<number> {
    this.cache.clear()
    this.renderingPages.clear()
    const loadingTask = pdfjsLib.getDocument({ data })
    this.pdf = await loadingTask.promise
    return this.pdf.numPages
  }

  /** 指定ページを Canvas に描画する（1-indexed） */
  async renderPage(pageNum: number, canvas: HTMLCanvasElement): Promise<void> {
    if (!this.pdf) throw new Error('PDF がロードされていません')

    // キャッシュから描画（高速）
    const cached = this.cache.get(pageNum)
    if (cached) {
      this.drawBitmap(cached, canvas)
      this.preload(pageNum)
      return
    }

    // キャッシュ無し: 直接描画
    await this.renderToCanvas(pageNum, canvas)
    this.preload(pageNum)
  }

  /** ページ数を取得する */
  get numPages(): number {
    return this.pdf?.numPages ?? 0
  }

  /** キャッシュとロードされた PDF をクリアする */
  dispose(): void {
    this.cache.forEach((bmp) => bmp.close())
    this.cache.clear()
    this.renderingPages.clear()
    this.pdf?.destroy()
    this.pdf = null
  }

  /** 指定ページを Canvas に直接レンダリングして ImageBitmap をキャッシュ */
  private async renderToCanvas(pageNum: number, canvas: HTMLCanvasElement): Promise<void> {
    if (!this.pdf) return
    const page = await this.pdf.getPage(pageNum)
    const viewport = this.calcViewport(page)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({ canvasContext: ctx, viewport }).promise

    // キャッシュ用に ImageBitmap を作成
    try {
      const bmp = await createImageBitmap(canvas)
      this.cache.set(pageNum, bmp)
    } catch {
      // createImageBitmap 非対応環境では無視
    }
  }

  /** キャッシュ済み ImageBitmap を Canvas に描画 */
  private drawBitmap(bmp: ImageBitmap, canvas: HTMLCanvasElement): void {
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d')
    ctx?.drawImage(bmp, 0, 0)
  }

  /** 前後 PRELOAD_RANGE ページをバックグラウンドでプリロード */
  private preload(currentPage: number): void {
    if (!this.pdf) return
    const total = this.pdf.numPages

    for (let i = 1; i <= PRELOAD_RANGE; i++) {
      this.preloadPage(currentPage + i, total)
      this.preloadPage(currentPage - i, total)
    }
  }

  private async preloadPage(pageNum: number, total: number): Promise<void> {
    if (!this.pdf) return
    if (pageNum < 1 || pageNum > total) return
    if (this.cache.has(pageNum) || this.renderingPages.has(pageNum)) return

    this.renderingPages.add(pageNum)
    try {
      const page = await this.pdf.getPage(pageNum)
      const viewport = this.calcViewport(page)

      // オフスクリーンキャンバスで描画
      const offscreen = document.createElement('canvas')
      offscreen.width = viewport.width
      offscreen.height = viewport.height
      const ctx = offscreen.getContext('2d')
      if (!ctx) return

      await page.render({ canvasContext: ctx, viewport }).promise

      const bmp = await createImageBitmap(offscreen)
      this.cache.set(pageNum, bmp)
    } catch {
      // プリロード失敗は無視
    } finally {
      this.renderingPages.delete(pageNum)
    }
  }

  /** 画面サイズに合わせた viewport を計算する */
  private calcViewport(page: pdfjsLib.PDFPageProxy): pdfjsLib.PageViewport {
    const screenW = window.innerWidth * (window.devicePixelRatio || 1)
    const screenH = window.innerHeight * (window.devicePixelRatio || 1)
    const baseViewport = page.getViewport({ scale: 1 })

    // 画面に収まるスケールを計算（縦横比を保持）
    // コントロールバー分（約80px）を除いた高さを使用
    const controlBarH = 80 * (window.devicePixelRatio || 1)
    const availH = screenH - controlBarH

    const scaleW = screenW / baseViewport.width
    const scaleH = availH / baseViewport.height
    const scale = Math.min(scaleW, scaleH)

    return page.getViewport({ scale })
  }
}
