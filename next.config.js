/** @type {import('next').NextConfig} */

// GitHub Pages (プロジェクトページ: https://<user>.github.io/<repo>/) では
// リポジトリ名がURLのサブパスになるため、basePath / assetPrefix の設定が必須。
// GitHub Actions 側で NEXT_PUBLIC_BASE_PATH="/<repo名>" を渡す想定。
// ローカル開発時 (`next dev`) は空文字のままでOK。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  // 完全な静的サイトとして出力する (GitHub Pagesはサーバーサイド機能を持たないため必須)
  output: 'export',

  // GitHub Pagesのサブパス配信に対応
  basePath: basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,

  // 静的エクスポートでは next/image の最適化サーバーが使えないため無効化する。
  // (このプロジェクトでは <img> タグ / 通常のCSS背景等で代替し、next/image自体を使わない方針)
  images: {
    unoptimized: true,
  },

  // 静的ホスティング(GitHub Pages)では index.html ルーティングの都合上
  // 末尾スラッシュ付きURL (/foo/) の形で出力した方が事故が少ない
  trailingSlash: true,

  // out/ 配下にリンター等の一時ファイルを含めない
  reactStrictMode: true,
};

module.exports = nextConfig;
