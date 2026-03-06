/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "primary": "#06f906",
                "accent-purple": "#a855f7",
                "background-light": "#f5f8f5",
                "background-dark": "#010409",
                "glass-dark": "rgba(10, 20, 10, 0.7)",
                "surface-dark": "#0a140a",
                "border-dark": "#1a331a",
                "text-muted": "#8fb38f",
            },
            fontFamily: {
                "display": ["Space Grotesk", "sans-serif"]
            },
            borderRadius: {
                "DEFAULT": "0.25rem",
                "lg": "0.5rem",
                "xl": "0.75rem",
                "full": "9999px"
            },
        },
    },
    plugins: [],
}
