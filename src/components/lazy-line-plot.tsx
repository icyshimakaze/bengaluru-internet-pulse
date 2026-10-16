"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { LinePlotProps } from "./line-plot";

const LinePlot = dynamic(() => import("./line-plot"), { ssr: false });

// Keep dimensions and the server-rendered data table; load Recharts just before the plot is needed.
export function LazyLinePlot(props: LinePlotProps) {
  const target = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!target.current) return;
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(target.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={target} className="deferred-plot">{visible && <LinePlot {...props} />}</div>;
}
