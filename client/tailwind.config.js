const path = require("node:path")
const twColors = require("tailwindcss/colors")
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true })

function resolveColor(value, fallback) {
  const color = (value || fallback).trim()
  const match = color.match(/^([a-z]+)-(\d{2,3})$/)
  if (match && twColors[match[1]]?.[match[2]]) return twColors[match[1]][match[2]]
  if (/^[0-9a-f]{3,8}$/i.test(color)) return `#${color}`
  return color
}

function toRgb(color) {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1]
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255)
  }
  const rgb = color.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (rgb) return rgb.slice(1, 4).map((n) => Number(n) / 255)
  const oklch = color.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+|none)\s+([\d.]+|none)/i)
  if (oklch) {
    const l = Number(oklch[1]) / (oklch[2] ? 100 : 1)
    const c = oklch[3] === "none" ? 0 : Number(oklch[3])
    const h = (oklch[4] === "none" ? 0 : Number(oklch[4])) * Math.PI / 180
    const a = c * Math.cos(h), b = c * Math.sin(h)
    const [lc, mc, sc] = [l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.291485548 * b].map((n) => n ** 3)
    const linear = [4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc, -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc, -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc]
    return linear.map((n) => Math.min(1, Math.max(0, n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055)))
  }
  return null
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((n) => n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function toHex(rgb) {
  return "#" + rgb.map((n) => Math.round(n * 255).toString(16).padStart(2, "0")).join("")
}

// Readable roles derived from the brand colour: text on white (4.5:1) and text on the brand colour.
function brandRoles(color) {
  const rgb = toRgb(color)
  if (!rgb) return { text: "#262626", foreground: "#171717" }
  let text = rgb
  while ((1.05) / (luminance(text) + 0.05) < 4.5) text = text.map((n) => n * 0.95)
  const foreground = (luminance(rgb) + 0.05) / 0.05 >= 1.05 / (luminance(rgb) + 0.05) ? "#171717" : "#ffffff"
  return { text: toHex(text), foreground }
}

const brandColor = resolveColor(process.env.VITE_BRAND_COLOR, "#e5e5e5")
const brand = brandRoles(brandColor)

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  prefix: "",
  content: [
    './pages/**/*.{ts,tsx,vue}',
    './components/**/*.{ts,tsx,vue}',
    './app/**/*.{ts,tsx,vue}',
    './src/**/*.{ts,tsx,vue}',
	],
  
  theme: {
    fontFamily: {
      sans: ['Inter', 'sans-serif'],
    },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--tenant-brand-color, " + brandColor + ")",
          text: "var(--tenant-brand-text, " + brand.text + ")",
          foreground: "var(--tenant-brand-foreground, " + brand.foreground + ")",
          hover: "var(--tenant-brand-hover, " + resolveColor(process.env.VITE_BRAND_COLOR_HOVER, "#f5f5f5") + ")",
          strong: "var(--tenant-brand-strong, " + resolveColor(process.env.VITE_BRAND_COLOR_STRONG, "#262626") + ")",
        },
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
      },
      borderRadius: {
      	xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "max(0px, calc(var(--radius) - 2px))",
        sm: "max(0px, calc(var(--radius) - 4px))",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--reka-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--reka-accordion-content-height)" },
          to: { height: 0 },
        },
        "collapsible-down": {
          from: { height: 0 },
          to: { height: 'var(--reka-collapsible-content-height)' },
        },
        "collapsible-up": {
          from: { height: 'var(--reka-collapsible-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "collapsible-down": "collapsible-down 0.2s ease-in-out",
        "collapsible-up": "collapsible-up 0.2s ease-in-out",
      },
    },
  },
  plugins: [],
}
