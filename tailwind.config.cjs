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
        display: ["Sora", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        body: ["Manrope", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"]
      }
    }
  },
  plugins: []
};
