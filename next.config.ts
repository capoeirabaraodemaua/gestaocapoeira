import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Next.js fetch cache globally — prevents stale reads from Supabase Storage
  experimental: {
    fetchCache: 'force-no-store',
    serverBodySizeLimit: '50mb',
  } as any,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // ── Security Headers ──────────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // XSS protection (legacy browsers)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy — restrict browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
          // Force HTTPS for 1 year
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://unpkg.com",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://*.supabase.io wss://*.supabase.co",
              "frame-src https://www.google.com https://recaptcha.google.com https://www.youtube.com https://youtube.com https://open.spotify.com https://widget.deezer.com https://www.tiktok.com https://www.kwai.com https://*.supabase.co https://*.supabase.io",
              "worker-src 'self' blob:",
              "media-src 'self' blob: https:",
            ].join('; '),
          },
        ],
      },
      {
        // noindex for all internal/admin pages
        source: '/(admin|financeiro|presenca|carteirinha|organograma|hierarquia|termo|api)(.*)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },

  // ── Redirects — enforce HTTPS ─────────────────────────────────────────────
  async redirects() {
    return [
      // Redirect www to non-www (adjust as needed)
      {
        source: '/(.*)',
        has: [{ type: 'host', value: 'www.accbm.com.br' }],
        destination: 'https://accbm.com.br/:path*',
        permanent: true,
      },
    ];
  },
} as NextConfig;

export default nextConfig;
// Orchids restart: 1774660100000
