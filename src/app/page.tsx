import QrScanner from '@/components/QrScanner';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-4 py-6">
      <h1 className="mb-4 text-center text-lg font-bold tracking-wide">
        LivePocket QR重複チェック
      </h1>
      <QrScanner />
    </main>
  );
}
