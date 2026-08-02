import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },

      // ── Page identity ──────────────────────────────────────────────────
      { title: "PalTrade — Autonomous Forex & Synthetic Trading" },
      {
        name: "description",
        content:
          "AI-powered autonomous trading terminal. Auto-pilot engine, real-time Deriv execution, live market analysis for Forex and synthetic indices.",
      },

      // ── Open Graph ─────────────────────────────────────────────────────
      { property: "og:title", content: "PalTrade — Autonomous Trading Terminal" },
      {
        property: "og:description",
        content:
          "AI auto-pilot trading engine, live Deriv WebSocket execution, BOS/CHoCH analysis and one-click multi-position management.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { property: "og:site_name", content: "PalTrade" },

      // ── Twitter ────────────────────────────────────────────────────────
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "PalTrade — Autonomous Trading Terminal" },
      {
        name: "twitter:description",
        content:
          "AI auto-pilot trading engine with live Deriv WebSocket execution.",
      },

      // ── PWA / mobile app shell ─────────────────────────────────────────
      // Makes "Add to Home Screen" on iOS behave like a native app
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "PalTrade" },
      // Android / Chrome
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "application-name", content: "PalTrade" },
      // Theme color — matches --background in CSS
      { name: "theme-color", content: "#1a1f2e", media: "(prefers-color-scheme: dark)" },
      { name: "theme-color", content: "#1a1f2e" },
      // Prevents phone number detection reformatting prices
      { name: "format-detection", content: "telephone=no" },
      // Microsoft tiles
      { name: "msapplication-TileColor", content: "#1a1f2e" },
      { name: "msapplication-TileImage", content: "/android-chrome-192x192.png" },
      { name: "msapplication-config", content: "none" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "PalTrade",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web, iOS, Android",
          description:
            "Autonomous forex & synthetic trading terminal with AI auto-pilot, real-time Deriv execution and live market analysis.",
          url: "/",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "PalTrade",
          url: "/",
        }),
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },

      // ── Favicons ───────────────────────────────────────────────────────
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },

      // ── iOS home screen icons ──────────────────────────────────────────
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      // Splash screen colours handled via theme-color meta above

      // ── PWA manifest ───────────────────────────────────────────────────
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="no-scrollbar">
      <head>
        <HeadContent />
      </head>
      {/*
        no-scrollbar on body hides the global scrollbar on all pages.
        overflow-x-hidden prevents horizontal bleed on mobile.
        The app content scrolls normally — the bar is just invisible.
      */}
      <body className="no-scrollbar overflow-x-hidden">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
