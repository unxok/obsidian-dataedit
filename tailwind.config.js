/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", ".theme-dark"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      textColor: {
        normal: "var(--text-normal)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        "accent-foreground": "vars(--text-on-accent)",
        success: "var(--text-success)",
        warning: "var(--text-warning)",
        error: "var(--text-error)",
        accent: "var(--text-accent)",
        "accent-hover": "var(--text-accent-hover)",
      },
      colors: {
        primary: "var(--background-primary)",
        "primary-alt": "var(--background-primary-alt)",
        secondary: "var(---background-secondary)",
        "secondary-alt": "var(---background-secondary-alt)",
        hover: "var(--background-modifier-hover)",
        "active-hover": "var(--background-modifier-active-hover)",
        border: "var(--background-modifier-border)",
        "border-hover": "var(--background-modifier-border-hover)",
        "border-focus": "var(--background-modifier-border-focus)",
        error: "var(--background-modifier-error)",
        "error-hover": "var(--background-modifier-error-hover)",
        success: "var(--background-modifier-success)",
        message: "var(--background-modifier-message)",
        "form-field": "var(--background-modifier-form-field)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
