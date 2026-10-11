import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        claw: {
          bg: "#07090c",
          panel: "#0d1117",
          border: "#1e2a38",
          muted: "#7a8b9a",
          text: "#e6edf3",
          accent: "#ff4d6d",
          cyan: "#3dfff3",
          gold: "#f0c14b",
          ok: "#3dd68c",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
