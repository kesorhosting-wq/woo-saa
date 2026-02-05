import type { Config } from "tailwindcss";

export default {
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
      fontFamily: {
        sans: [
          '"Noto Sans"',
          '"Noto Sans Khmer"',
          "Battambang",
          '"Noto Sans Symbols 2"',
          "system-ui",
          "sans-serif",
        ],
        display: ["Cinzel", "serif"],
        khmer: ["Battambang", '"Noto Sans Khmer"', '"Noto Sans"', "cursive"],
        unicode: [
          '"Noto Sans"',
          '"Noto Sans Khmer"',
          '"Noto Sans Symbols 2"',
          '"Segoe UI Symbol"',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          "sans-serif",
        ],
      },

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

        /* 🔥 DARK BLUE THEME (replaces GOLD entirely) */
        darkBlue: {
          DEFAULT: "hsl(var(--dark-blue))",
          light: "hsl(var(--dark-blue-light))",
          dark: "hsl(var(--dark-blue-dark))",
          glow: "hsl(var(--dark-blue-glow))",
        },

        cream: {
          DEFAULT: "hsl(var(--cream))",
          dark: "hsl(var(--cream-dark))",
        },

        burgundy: {
          DEFAULT: "hsl(var(--burgundy))",
          light: "hsl(var(--burgundy-light))",
        },

        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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

        /* 🔥 Dark blue pulse (replaces pulse-gold) */
        "pulse-darkBlue": {
          "0%, 100%": {
            boxShadow: "0 0 20px hsl(var(--dark-blue) / 0.4)",
          },
          "50%": {
            boxShadow: "0 0 40px hsl(var(--dark-blue) / 0.6)",
          },
        },

        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },

        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-darkBlue": "pulse-darkBlue 2s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
        "fade-in": "fade-in 0.3s ease-out",
      },

      backgroundImage: {
        "gradient-darkBlue": "var(--gradient-dark-blue)",
        "gradient-cream": "var(--gradient-cream)",
        "gradient-hero": "var(--gradient-hero)",
        "gradient-card": "var(--gradient-card)",
      },

      boxShadow: {
        darkBlue: "var(--shadow-dark-blue)",
        elegant: "var(--shadow-elegant)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
