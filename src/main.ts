/**
 * main.ts
 * エントリポイント。DOM の準備完了後に App を起動する。
 */

import './style.css'
import { App } from './app'

document.addEventListener('DOMContentLoaded', () => {
  new App()
})
