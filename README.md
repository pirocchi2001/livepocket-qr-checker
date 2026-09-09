# LivePocket QR重複チェック WEBアプリ

Next.js (App Router, 静的エクスポート) + Firebase Firestore (Sparkプラン) + GitHub Pages で動作する、
LivePocketのQRコード重複読み取りチェックアプリです。

## 構成

```
.
├── .github/workflows/deploy.yml   # GitHub Pagesへの自動デプロイ
├── firestore.rules                # Firestoreセキュリティルール
├── next.config.js                 # output: 'export' (静的サイト化)
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── QrScanner.tsx          # カメラ制御・状態管理の本体
│   │   └── ResultOverlay.tsx      # OK/NG/違うコードの表示
│   └── lib/
│       ├── firebase.ts            # Firebase初期化
│       └── checkDuplicate.ts      # 判定ロジック(ハッシュ化・トランザクション)
└── .env.local.example
```

## 判定フロー

1. `html5-qrcode` がカメラ映像からQR文字列をデコード
2. 文字列に `livepocket` が含まれるか大文字小文字無視でチェック
   - 含まれない → **Firestoreに一切アクセスせず** 「違うコード」表示 → 手動確認待ち
3. 含まれる → `crypto-js` の SHA-256 でハッシュ化 (このハッシュ値が `scans/{hash}` のドキュメントID)
4. `runTransaction` でドキュメントを取得
   - 存在しない → その場で `{ scannedAt: serverTimestamp() }` を作成 → 「OK(緑)」を約1.2秒表示して自動でスキャン再開
   - 存在する → 「NG(赤)」+ 初回読み取り日時を表示 → 手動確認待ち

トランザクションを使うことで、複数台の端末が同時に同じQRを読んでも
「どちらか一方だけが新規作成に成功し、もう一方は必ずduplicate判定になる」ことが保証されます。

## セットアップ手順

### 1. Firebaseプロジェクト作成 (Sparkプラン)

1. [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成(料金プランはデフォルトのSparkのままでOK)
2. 「Firestore Database」を有効化(ロケーションは `asia-northeast1` 等お好みで)
3. 「プロジェクトの設定」→「全般」→「マイアプリ」で **ウェブアプリ** を追加し、`firebaseConfig` の値を控える
4. 「Firestore Database」→「ルール」タブに `firestore.rules` の内容をそのまま貼り付けて公開
   (認証なしで誰でも「新規作成のみ」できる/一覧取得や上書きは不可、という制限をかけています)

> Firebase CLIを使う場合は `firebase deploy --only firestore:rules` でも反映できますが、
> 今回はFirestoreのみの利用なので、コンソールから直接貼り付ける方法が最も簡単です。

### 2. ローカル開発

```bash
npm install
cp .env.local.example .env.local
# .env.local に firebaseConfig の値を記入

npm run dev
# http://localhost:3000 (カメラはlocalhostなのでHTTPS無しでも動作します)
```

### 3. GitHub Pagesの準備

1. GitHubリポジトリを作成し、このプロジェクトをpush
2. リポジトリの **Settings → Pages → Build and deployment → Source** を
   「**GitHub Actions**」に設定
3. **Settings → Secrets and variables → Actions** に以下を登録
   (`.env.local` と同じ値、`NEXT_PUBLIC_BASE_PATH` は不要 = ワークフローがリポジトリ名から自動生成します)
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
4. `main` ブランチにpushすると `.github/workflows/deploy.yml` が自動で
   `npm run build` → `./out` を GitHub Pages に公開します
   (`output: 'export'` により `next build` だけで静的サイト一式が `./out` に生成されます)

デプロイ後のURLは `https://<GitHubユーザー名>.github.io/<リポジトリ名>/` になります。
GitHub Pagesは既定でHTTPS配信されるため、カメラ (`getUserMedia`) もそのまま動作します。

## 静的エクスポートに関する注意点

- `next/image` は使用していません(使う場合は `images.unoptimized: true` 済みなので動作はしますが、
  最適化サーバーが無いため実質 `<img>` と同等になります)
- API Routes / Server Actions / Middleware など、サーバーが必要な機能は使用していません
  (Firestoreへのアクセスはすべてブラウザ側のクライアントSDKから直接行います)
- `html5-qrcode` は `document` / `navigator` に依存するため、`useEffect` 内で
  動的 `import()` してクライアント側でのみ読み込むようにしています
  (ビルド時の静的生成でエラーにならないようにするための対応です)

## 管理画面(読み取り履歴のExcel出力)

`/admin` ページから、読み取り履歴の一覧表示とExcel(.xlsx)ダウンロードができます。
一覧取得(list)は誰でもできると参加者情報の全件抜き出しにつながるため、
Firebase Authentication(メール/パスワード)でログインした管理者のみに制限しています。

### 有効化手順

1. Firebase Console → 「Authentication」→「Sign-in method」で
   **メール/パスワード** プロバイダを有効化する
2. 「Authentication」→「Users」タブで管理者用のユーザー(メールアドレス+パスワード)を追加する
   (このアカウント情報は管理画面ログイン専用です。参加者向けには公開しません)
3. `firestore.rules` を最新の内容(本リポジトリのもの)で再公開する
   (`allow list: if request.auth != null;` が追加されています)
4. デプロイ後、`https://<user>.github.io/<repo>/admin/` にアクセスし、
   作成したメールアドレス・パスワードでログインする
5. 「最新の履歴を取得」→「Excelでダウンロード」で `livepocket-scan-history_YYYYMMDD.xlsx` が
   ダウンロードされる(列: No / 読み取り日時 / 識別ID(ハッシュ))

> 識別ID列はQRコード文字列のSHA-256ハッシュ値です。QRコードの元の文字列(参加者名など個人情報)は
> 一切保存していないため、人数集計・時刻集計用の参考値としてご利用ください。

## 通過人数のリアルタイム表示

トップページ(スキャン画面)に、全端末合計の通過人数をリアルタイム表示します。
一覧取得(list)を使わずに済むよう、`meta/counter`という単一ドキュメントの
`totalCount`フィールドだけを集計・購読する方式にしています。

### 有効化手順(初回のみ)

1. Firebase Console → Firestore Database → 「データ」タブで、
   コレクションID `meta`、ドキュメントID `counter` を作成し、
   フィールド `totalCount`(数値型)を `0` で追加する
2. `firestore.rules` を最新の内容(本リポジトリのもの)で再公開する
   (`meta/counter`への「+1のみ許可」ルールが追加されています)

これでスキャン成功のたびに`totalCount`が+1され、画面上の表示もリアルタイムで更新されます。

> 通過人数をイベントごとにリセットしたい場合は、Firebase Consoleから
> `meta/counter`の`totalCount`を手動で`0`に書き換えてください。

## Firestore無料枠(Sparkプラン)についての目安

- 読み取り 50,000回/日、書き込み 20,000回/日、保存容量 1GiB
- 1回のスキャンにつき: 読み取り1回(存在確認) + 新規の場合のみ書き込み1回
- 重複チェックのみ(読み取り1回)なので、想定来場者数が数千〜1万人規模のイベントであれば
  無料枠の範囲内で十分運用できます
- 認証なしで誰でも書き込める構成のため、悪意あるアクセスからの枠消費が心配な場合は
  [Firebase App Check](https://firebase.google.com/docs/app-check) の導入を検討してください
  (reCAPTCHA v3 / Enterprise 等と組み合わせ可能です)

## デプロイ前チェックリスト

- [ ] Firestoreルールを `firestore.rules` の内容で公開済み
- [ ] GitHub Secretsに6つのFirebase設定値を登録済み
- [ ] Settings → Pages の Source が「GitHub Actions」になっている
- [ ] スマートフォン実機のブラウザで `https://<user>.github.io/<repo>/` にアクセスし、
      カメラ権限ダイアログが出てQRスキャンが動作することを確認
