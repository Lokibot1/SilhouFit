import type { Credentials } from '../types/accounts'
import { downloadFile } from './downloadFile'

const WIDTH = 640
const SCALE = 2
const PAD = 32
// Fixed light colours: the card is handed over or printed, so it must not follow the app's theme.
const PAPER = '#ffffff'
const INK = '#14161a'
const MUTED = '#4b5260'
const RULE = '#c9ced6'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Breaks `text` into lines no wider than `maxWidth`. Words wrap; a single word wider than a line (a long email) breaks between characters. */
export function wrapText(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const attempt = line ? `${line} ${word}` : word
    if (measure(attempt) <= maxWidth) {
      line = attempt
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const char of word) {
      if (line && measure(line + char) > maxWidth) {
        lines.push(line)
        line = ''
      }
      line += char
    }
  }
  if (line) lines.push(line)
  return lines
}

interface Op {
  text: string
  font: string
  color: string
  y: number
}

/** Draws the credentials as a PNG (2x for sharpness), with the account holder's full name when given: a username block and a temporary password block, ready to download or send. */
export function renderCredentialsImage(credentials: Credentials, holder?: string, withUsername = true): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas is not available.'))

  const ops: Op[] = []
  let y = PAD
  const place = (text: string, font: string, color: string, lineHeight: number, indent = 0) => {
    ctx.font = font
    for (const line of wrapText((t) => ctx.measureText(t).width, text, WIDTH - 2 * PAD - indent)) {
      y += lineHeight
      ops.push({ text: line, font, color, y: y - lineHeight * 0.25 })
    }
  }

  place('SilhouFit', `700 28px ${SANS}`, INK, 34)
  place('Account credentials', `400 16px ${SANS}`, MUTED, 22)
  y += 12
  const rows: [string, string][] = [
    ...(holder ? ([['Account holder', holder]] as [string, string][]) : []),
    ...(withUsername ? ([['Username', credentials.username]] as [string, string][]) : []),
    ['Sign-in email', credentials.email],
    ['Temporary password', credentials.password],
  ]
  const rules: number[] = []
  for (const [label, value] of rows) {
    rules.push(y + 8)
    y += 16
    place(label, `600 14px ${SANS}`, MUTED, 20)
    place(value, `700 22px ${MONO}`, INK, 30)
  }
  y += 12
  place('Sign in with this temporary password. You will be asked to choose your own at first sign-in. Keep this card private.', `400 14px ${SANS}`, MUTED, 20)
  const height = y + PAD

  // Resizing clears the canvas and its state, so everything is set up again before drawing.
  canvas.width = WIDTH * SCALE
  canvas.height = height * SCALE
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, height)
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  for (const ruleY of rules) {
    ctx.beginPath()
    ctx.moveTo(PAD, ruleY)
    ctx.lineTo(WIDTH - PAD, ruleY)
    ctx.stroke()
  }
  ctx.textBaseline = 'alphabetic'
  for (const { text, font, color, y: lineY } of ops) {
    ctx.font = font
    ctx.fillStyle = color
    ctx.fillText(text, PAD, lineY)
  }

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be made.'))), 'image/png'))
}

export async function downloadCredentialsImage(credentials: Credentials, holder?: string, withUsername = true) {
  downloadFile(await renderCredentialsImage(credentials, holder, withUsername), `silhoufit-${credentials.username}-credentials.png`)
}
