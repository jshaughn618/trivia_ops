/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel2)",
        text: "var(--text)",
        muted: "var(--muted)",
        border: "var(--border)",
        accent: "var(--accent)",
        danger: "var(--danger)"
      },
      fontFamily: {
        display: ["Oswald", "sans-serif"],
        body: ["Chakra Petch", "sans-serif"]
      }
    }
  },
  plugins: []
};
