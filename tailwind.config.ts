import type { Config } from "tailwindcss";

/**
 * Design tokens for ArcRelay's visual identity: a dark, cool-toned
 * instrument-panel palette (not pure black) with a warm gold signature
 * accent tied directly to the subject — settlement, value, currency —
 * plus semantic cyan (telemetry) and violet (agent/AI) accents. See
 * app/globals.css for the underlying CSS custom properties.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        surface: {
          DEFAULT: "var(--color-surface)",
          elevated: "var(--color-surface-elevated)",
          sunken: "var(--color-surface-sunken)",
        },
        hairline: {
          DEFAULT: "var(--color-hairline)",
          strong: "var(--color-hairline-strong)",
        },
        ink: "var(--color-ink)",
        body: "var(--color-body)",
        muted: "var(--color-muted)",
        gold: {
          DEFAULT: "var(--color-gold)",
          dim: "var(--color-gold-dim)",
        },
        cyan: "var(--color-cyan)",
        violet: "var(--color-violet)",
        success: "var(--color-success)",
        error: "var(--color-error)",
      },
      fontFamily: {
        mono: ["var(--font-mono)"],
        sans: ["var(--font-sans)"],
      },
      borderRadius: {
        xs: "3px",
        sm: "5px",
        md: "7px",
        lg: "10px",
        xl: "14px",
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "tick-flash": {
          "0%": { boxShadow: "inset 2px 0 0 0 var(--color-gold), 0 0 0 rgba(232,177,74,0)" },
          "40%": { boxShadow: "inset 2px 0 0 0 var(--color-gold), 0 0 24px rgba(232,177,74,0.15)" },
          "100%": { boxShadow: "inset 2px 0 0 0 transparent, 0 0 0 rgba(232,177,74,0)" },
        },
        "pulse-travel": {
          "0%": { left: "0%", opacity: "0" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { left: "100%", opacity: "0" },
        },
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        ticker: "ticker 38s linear infinite",
        "tick-flash": "tick-flash 1.6s ease-out",
        "pulse-travel": "pulse-travel 1.4s ease-in-out infinite",
        blink: "blink 1s step-start infinite",
      },
    },
  },
  plugins: [],
};

export default config;
