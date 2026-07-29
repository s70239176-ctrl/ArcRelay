import type { Config } from "tailwindcss";

/**
 * Design tokens sourced from DESIGN.md — the warm-canvas editorial system
 * (cream canvas, coral CTA, dark-navy product surfaces, slab-serif display
 * paired with humanist sans). Colors are wired to CSS custom properties in
 * app/globals.css so they read `hsl(var(--...))`-free — plain hex vars are
 * simpler here since the palette is a fixed brand set, not a themeable one.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          active: "var(--color-primary-active)",
          disabled: "var(--color-primary-disabled)",
        },
        ink: "var(--color-ink)",
        body: {
          DEFAULT: "var(--color-body)",
          strong: "var(--color-body-strong)",
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          soft: "var(--color-muted-soft)",
        },
        hairline: {
          DEFAULT: "var(--color-hairline)",
          soft: "var(--color-hairline-soft)",
        },
        canvas: "var(--color-canvas)",
        "surface-soft": "var(--color-surface-soft)",
        "surface-card": "var(--color-surface-card)",
        "surface-cream-strong": "var(--color-surface-cream-strong)",
        "surface-dark": {
          DEFAULT: "var(--color-surface-dark)",
          elevated: "var(--color-surface-dark-elevated)",
          soft: "var(--color-surface-dark-soft)",
        },
        "on-primary": "var(--color-on-primary)",
        "on-dark": {
          DEFAULT: "var(--color-on-dark)",
          soft: "var(--color-on-dark-soft)",
        },
        "accent-teal": "var(--color-accent-teal)",
        "accent-amber": "var(--color-accent-amber)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "9999px",
      },
      letterSpacing: {
        "display-xl": "-1.5px",
        "display-lg": "-1px",
        "display-md": "-0.5px",
        "display-sm": "-0.3px",
        caption: "1.5px",
      },
    },
  },
  plugins: [],
};

export default config;
