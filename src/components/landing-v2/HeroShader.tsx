import { useTheme } from '../../contexts/ThemeContext'
import { ShaderBackground, type ShaderColors } from '../ui/ShaderBackground'

const rgb = (hex: number): ShaderColors[number] => [(hex >> 16) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]

// DESIGN.md palette. The shader runs from its first to its last colour, so the ends carry the tone (and the letter-vs-band
// contrast) and the red sits mid-palette, where the field spends the least time. Dark: every colour is at least 3:1 on Obsidian.
// Light: every colour is at least 3:1 on Paper.
const DARK = [0x85807c, 0xeeeced, 0xcb1c2b, 0xeeeced, 0xfffbfd].map(rgb)
const LIGHT = [0x85807c, 0x322d2f, 0xcb1c2b, 0x161113, 0x322d2f].map(rgb)

/** The login page's KRAL shader, recoloured for the app theme and set to swirl under the pointer. Loaded lazily by Hero. */
export default function HeroShader() {
  const { theme } = useTheme()
  return <ShaderBackground colors={theme === 'dark' ? DARK : LIGHT} interactive />
}
