/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./index.tsx",
        "./App.tsx",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./embed.tsx",
    ],
    theme: {
        extend: {
            colors: {
                'sofia-gold': '#d97706',
                'sofia-dark': '#0f172a',
            },
            fontFamily: {
                inter: ['Inter', 'sans-serif'],
                playfair: ['Playfair Display', 'serif'],
            },
        },
    },
    plugins: [],
}
