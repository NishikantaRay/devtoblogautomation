import Link from "next/link";
import { ReviewBoard } from "@/components/review-board";

export const metadata = {
  title: "Review queue — Blog2DEV",
};

export default function ReviewPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/"
            className="text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Converter
          </Link>
          <Link
            href="/schedule"
            className="text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Full queue
          </Link>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Review queue</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Read a post, edit anything you want to change, then approve it. Nothing reaches
          DEV.to until you approve it — and the scheduler publishes approved posts at their
          scheduled time.
        </p>
      </div>
      <ReviewBoard />
    </main>
  );
}
