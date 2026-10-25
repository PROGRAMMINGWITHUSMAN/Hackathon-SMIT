"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// A slim top progress indicator for App Router navigations (there is no
// Pages-Router router.events here). Mechanism:
//   START   — a click on any same-app <a href> whose target differs from the
//             current pathname (capture phase, so it works for every Link)
//   COMPLETE— the pathname changes (navigation committed) or the link click
//             did not lead anywhere within 6s (hard "never stuck" timeout)
// External URLs, #anchors and same-route clicks are ignored. Animation is
// disabled under prefers-reduced-motion (the bar still appears/disappears,
// it just doesn't slide). Accessible: role="progressbar" with a label.
export default function RouteProgress() {
  const pathname = usePathname();
  const [stage, setStage] = useState("idle");
  const [progress, setProgress] = useState(0);
  const navigating = useRef(false);
  const previousPathname = useRef(pathname);
  const fallbackTimer = useRef(null);
  const hideTimer = useRef(null);

  useEffect(() => {
    function clearTimers() {
      clearTimeout(fallbackTimer.current);
      clearTimeout(hideTimer.current);
      fallbackTimer.current = null;
      hideTimer.current = null;
    }

    function onLinkClick(event) {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = event.target.closest?.("a");
      if (!anchor) return;
      if (
        !anchor.href ||
        anchor.origin !== window.location.origin ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const target = new URL(anchor.href);
      if (target.pathname === pathname) return; // same-route or query-only navigation

      clearTimers();
      navigating.current = true;
      setProgress(8);
      setStage("loading");
      fallbackTimer.current = setTimeout(() => {
        navigating.current = false;
        setStage("fading");
        hideTimer.current = setTimeout(() => {
          setProgress(0);
          setStage("idle");
          hideTimer.current = null;
        }, 220);
        fallbackTimer.current = null;
      }, 6000);
    }
    document.addEventListener("click", onLinkClick, true);
    return () => {
      document.removeEventListener("click", onLinkClick, true);
      clearTimers();
    };
  }, [pathname]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    if (!navigating.current) return;

    navigating.current = false;
    clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
    clearTimeout(hideTimer.current);
    setProgress(100);
    setStage("complete");
    hideTimer.current = setTimeout(() => {
      setProgress(0);
      setStage("idle");
      hideTimer.current = null;
    }, 220);
  }, [pathname]);

  useEffect(() => {
    if (stage !== "loading") return;
    const interval = setInterval(() => {
      setProgress((current) => Math.min(90, current + (90 - current) * 0.08));
    }, 100);
    return () => clearInterval(interval);
  }, [stage]);

  if (stage === "idle") return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className={`fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/10 transition-opacity duration-200 ${
        stage === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        className="route-progress-bar h-full bg-primary"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
