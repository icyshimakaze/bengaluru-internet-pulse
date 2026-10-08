"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui/button";
export function TopicRecovery({ reset }: { reset?: () => void }) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  return <section className="topic-recovery"><span className="editorial-eyebrow">SIGNAL BRIEF / TEMPORARILY UNAVAILABLE</span><h1>This brief couldn&apos;t be loaded.</h1><p>The stored topic data is temporarily unavailable. Retry to read the latest validated snapshot.</p><div><Button disabled={pending} onClick={() => startTransition(() => { if (reset) reset(); else router.refresh(); })}>{pending ? "Reading the brief…" : "Retry topic"}</Button><Link className="editorial-link" href="/">Return to the pulse ↗</Link></div><p className="recovery-status" role="status">{pending ? "Retrying the topic read…" : ""}</p></section>;
}
