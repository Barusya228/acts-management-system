import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // Сетка брейкпоинтов проекта:
    // <480 — телефоны (портрет), база без префикса;
    // sm 480+ — крупные телефоны; md 768+ — планшеты (портрет);
    // lg 1024+ — планшеты (ландшафт) / малые ноутбуки;
    // xl 1200+ — ноутбуки; 2xl 1440+ — большие мониторы.
    screens: {
      sm: '480px',
      md: '768px',
      lg: '1024px',
      xl: '1200px',
      '2xl': '1440px',
    },
    extend: {},
  },
  plugins: [],
}
export default config
