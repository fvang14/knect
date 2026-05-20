import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "warm-bg":     "#faf8f4",
        "warm-border": "#ece6d6",
        "warm-line":   "#f3eee2",
        "warm-muted":  "#fafaf7",
      },
      borderRadius: {
        card:    "14px",
        "card-lg": "16px",
      },
    },
  },
  plugins: [],
};
export default config;
