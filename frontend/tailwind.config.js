/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Landing Page Custom Colors
        "surface-container-highest": "#353434",
        "on-primary-container": "#636565",
        "secondary-fixed-dim": "#c6c6c6",
        "on-primary-fixed-variant": "#454747",
        "tertiary-container": "#e2e2e2",
        "surface-dim": "#141313",
        "primary-fixed-dim": "#c6c6c7",
        "primary-fixed": "#e2e2e2",
        "on-secondary-fixed-variant": "#474747",
        "on-error-container": "#ffdad6",
        "surface-bright": "#3a3939",
        "inverse-primary": "#5d5f5f",
        "secondary-fixed": "#e2e2e2",
        "on-surface": "#e5e2e1",
        "tertiary-fixed": "#e2e2e2",
        "on-tertiary-container": "#636565",
        "inverse-surface": "#e5e2e1",
        "surface-container": "#201f1f",
        "surface-container-lowest": "#0e0e0e",
        "on-error": "#690005",
        "secondary-container": "#474747",
        "outline-variant": "#444748",
        "surface-container-high": "#2a2a2a",
        "surface-tint": "#c6c6c7",
        "on-tertiary-fixed": "#1a1c1c",
        "on-secondary": "#303030",
        "primary-container": "#e2e2e2",
        "on-secondary-container": "#b5b5b5",
        "surface-variant": "#353434",
        "surface-container-low": "#1c1b1b",
        "on-surface-variant": "#c4c7c8",
        "surface": "#141313",
        "on-primary-fixed": "#1a1c1c",
        "on-tertiary": "#2f3131",
        "error-container": "#93000a",
        "on-secondary-fixed": "#1b1b1b",
        "on-background": "#e5e2e1",
        "inverse-on-surface": "#313030",
        "on-tertiary-fixed-variant": "#454747"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Landing Page overrides
        'none': '0px',
      },
      spacing: {
        "md": "16px",
        "xs": "4px",
        "sm": "8px",
        "xl": "64px",
        "unit": "4px",
        "margin": "40px",
        "gutter": "24px",
        "lg": "32px"
      },
      fontFamily: {
        "display-xl": ["Anton", "sans-serif"],
        "label-caps": ["Space Mono", "monospace"],
        "body-sm": ["Space Mono", "monospace"],
        "headline-md": ["Anton", "sans-serif"],
        "headline-lg": ["Anton", "sans-serif"],
        "body-lg": ["Space Mono", "monospace"],
        "data-lg": ["Space Mono", "monospace"],
        "space-mono": ["Space Mono", "monospace"],
        "anton": ["Anton", "sans-serif"],
      },
      fontSize: {
        "display-xl": ["120px", {"lineHeight": "100px", "letterSpacing": "-0.04em", "fontWeight": "400"}],
        "label-caps": ["12px", {"lineHeight": "16px", "letterSpacing": "0.1em", "fontWeight": "700"}],
        "body-sm": ["14px", {"lineHeight": "20px", "letterSpacing": "0em", "fontWeight": "400"}],
        "headline-md": ["32px", {"lineHeight": "32px", "letterSpacing": "0em", "fontWeight": "400"}],
        "headline-lg": ["64px", {"lineHeight": "60px", "letterSpacing": "-0.02em", "fontWeight": "400"}],
        "body-lg": ["18px", {"lineHeight": "28px", "letterSpacing": "0em", "fontWeight": "400"}],
        "data-lg": ["24px", {"lineHeight": "24px", "letterSpacing": "-0.02em", "fontWeight": "700"}]
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        marquee: "marquee 30s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
