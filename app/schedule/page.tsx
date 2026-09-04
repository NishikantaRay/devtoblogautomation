import Link from "next/link";
import { ScheduleQueue } from "@/components/schedule-queue";

export const metadata = {
  title: "Scheduled posts — Blog2DEV",
};

export default function SchedulePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to converter
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Scheduled posts</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Queued articles publish automatically at their scheduled time — as long as the
          worker is running (<code>npm run scheduler</code>).
        </p>
      </div>
      <ScheduleQueue />
    </main>
  );
}
