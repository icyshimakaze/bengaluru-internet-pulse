"use client";
import { useRef, useEffect, useState } from "react";
import { Share2, Check } from "lucide-react";

export function ShareTopic({ title, url }: { title: string; url: string }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `${title} · Bengaluru Pulse`, url });
      else { await navigator.clipboard.writeText(url); setMessage("Link copied"); }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("Copy the address from your browser to share.");
    }
    clearTimeout(timer.current); timer.current = setTimeout(() => setMessage(""), 4000);
  }
  return <div className="share-control"><button className="editorial-link" onClick={() => void share()}>{message === "Link copied" ? <Check size={15} aria-hidden="true" /> : <Share2 size={15} aria-hidden="true" />}Share trend</button><span role="status" className="share-message">{message}</span></div>;
}
