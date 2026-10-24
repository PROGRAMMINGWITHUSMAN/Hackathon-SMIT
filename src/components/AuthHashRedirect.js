"use client";

import { useEffect } from "react";

// Invisible safety net for the public pages. If an auth link ever lands on
// `/` or `/login` carrying credentials (URL hash with tokens/error, or
// ?code=), hand them to the proper callback page instead of letting them
// sit unconsumed — an unconsumed token looks like "the link did nothing"
// and a second click then burns the single-use link.
export default function AuthHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    const code = new URLSearchParams(window.location.search).get("code");
    const hasAuthHash =
      hash.includes("access_token") || hash.includes("error=");
    if (hasAuthHash || code) {
      window.location.replace(
        `/auth/callback${code ? `?code=${encodeURIComponent(code)}` : ""}${hash}`
      );
    }
  }, []);

  return null;
}
