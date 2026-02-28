# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

PDFをWebページとして表示し、指定した時間間隔で自動ページめくりを行うWebアプリケーション。iPhoneのSafariでの動作を主目的とする。

**仕様 (SPEC.md より):**
- PDFをWebページとして表示する
- 指定した時間ちょうどで自動でページめくりが完了する
- iPhoneのSafariで実行する

## コミュニケーションルール

- **応答言語**: Claudeからの応答はすべて日本語で行うこと
- **コメント・ドキュメント**: 日本語で記述する
- **例外**: CSS class名、関数名、変数名などの技術的な識別子は英語のまま

## 実装上の注意点

- **ターゲット環境**: iPhoneのSafari（Mobile Safari）に特化した動作確認が必要
- **PDF表示**: ブラウザネイティブのPDF表示ではなく、JavaScript（例: PDF.js）によるページ単位のレンダリングが必要（自動ページめくりのため）
- **タイマー精度**: `setInterval` / `requestAnimationFrame` を使用するが、iOSのバックグラウンド制限・スリープに注意
- **ファイル読み込み**: iPhoneからのPDFファイル選択は `<input type="file" accept="application/pdf">` を使用する

## 技術選定の指針（未決定の場合）

実装を始める場合、以下を優先的に検討すること：
- **フレームワーク**: バニラJS or 軽量なもの（Safari互換性を最優先）
- **PDF描画**: [PDF.js](https://mozilla.github.io/pdf.js/) が最も実績あり
- **ビルドツール**: Vite（軽量・高速、モダンブラウザ対応）
- **パッケージマネージャー**: npm or pnpm
