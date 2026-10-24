import "./globals.css";

// System font stack only — deliberately no next/font/google. Google Fonts are
// fetched from the network at build time, which made `next build` fail
// intermittently (verified 2026-10-24). Offline-safe builds matter on demo day.

export const metadata = {
  title: "HCM Lite",
  description: "Lightweight HR Management System — Saylani Hackathon",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
