/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel2)",
        panel3: "var(--panel3)",
        text: "var(--text)",
        "text-soft": "var(--text-soft)",
        muted: "var(--muted)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        "accent-ink": "var(--accent-ink)",
        "accent-soft": "var(--accent-soft)",
        danger: "var(--danger)",
        "danger-fg": "var(--danger-fg)",
        "danger-ink": "var(--danger-ink)"
      },
      fontFamily: {
        display: ["Sora", "Satoshi", "Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        body: ["Manrope", "Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        satoshi: ["Satoshi", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        geist: ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"]
      },
      boxShadow: {
        glass: "0 16px 44px rgba(3, 6, 12, 0.56)",
        float: "0 22px 56px rgba(3, 6, 12, 0.66)",
        accent: "0 0 0 1px rgba(255,191,99,0.28), 0 12px 36px rgba(255,171,61,0.22)"
      },
      keyframes: {
        "soft-float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-2px)" }
        },
        "pulse-amber": {
          "0%, 100%": {
            boxShadow: "0 0 0 1px rgba(255,191,99,.18), 0 0 0 rgba(255,171,61,0)"
          },
          "50%": {
            boxShadow: "0 0 0 1px rgba(255,191,99,.34), 0 0 28px rgba(255,171,61,.28)"
          }
        }
      },
      animation: {
        "soft-float": "soft-float 4.2s ease-in-out infinite",
        "pulse-amber": "pulse-amber 2.8s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
