"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <section className="empty-state page-empty"><h1>The pulse is temporarily unavailable.</h1><p>Please retry to load the latest snapshot.</p><Button onClick={reset}>Try again</Button></section>; }
