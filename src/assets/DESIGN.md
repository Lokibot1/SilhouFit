# KRAL: Design System

Derived from an 11-second screen recording of a Behance brand-identity case study (designer credit on screen: Francis Gomez). Values were sampled from compressed video frames, so hex codes are close matches, not the official specs. Items marked **(verify)** couldn't be read cleanly. Get the source files or brand guide before shipping.

> Spelling check: every asset in the video reads **KRAL**, not KRUL. Confirm with the owner.

---

## 1. Brand in one line

Streetwear label with a hard, industrial attitude. One loud red, a lot of black and off-white, oversized wordmark, utilitarian labelling (hang tags, QR codes, care-label tape). The tagline pair seen on screen: **"Made to Represent // Mark of Identity"**.

Keywords: individuality, worldwide, creative department, pattern series.

---

## 2. Color

### Core palette

| Token | Name | Hex (sampled) | Role |
|---|---|---|---|
| `--kral-red` | KRAL Red | `#CB1C2B` | Brand color. Logo, CTAs, full-bleed panels, tape, tags |
| `--kral-obsidian` | Obsidian | `#161113` | Primary dark background, text on light |
| `--kral-graphite` | Graphite | `#322D2F` | Raised surfaces on dark, borders on dark, secondary text on light |
| `--kral-stonewash` | Stonewash | `#85807C` | Muted text, dividers, disabled states, captions |
| `--kral-porcelain` | Porcelain | `#EEECED` | Light surface, cards on white, hover fills |
| `--kral-paper` | Paper | `#FFFBFD` | Page background (slightly warm white, never pure `#FFF`) |

Obsidian, Graphite, Stonewash and Porcelain are the names printed in the palette strip. A fifth, pale pink swatch sits first in that strip; it's most likely a red tint **(verify)**. Paper and the exact red are measured, not named in the source.

### Usage ratio

Roughly 45% Paper/Porcelain, 35% Obsidian, 20% Red. Red works as a spotlight. A screen with red everywhere loses the effect. Full-bleed red appears only on hero panels, tape, bags and the odd poster.

### Contrast (computed)

| Pair | Ratio | Use |
|---|---|---|
| White on Red | ~5.6:1 | OK for buttons and labels |
| Red on Paper | ~5.6:1 | OK for headings and links |
| Red on Obsidian | ~3.3:1 | Large display type only. Never body text |
| Obsidian on Paper | >15:1 | Body text |
| Stonewash on Paper | ~3.7:1 | Captions 14px+ only |

### CSS tokens

```css
:root {
  --kral-red: #CB1C2B;
  --kral-red-press: #A81624;   /* derived, not in source */
  --kral-obsidian: #161113;
  --kral-graphite: #322D2F;
  --kral-stonewash: #85807C;
  --kral-porcelain: #EEECED;
  --kral-paper: #FFFBFD;
}
```

`--kral-red-press` is my derivation for pressed/hover states. Everything else comes from the video.

---

## 3. Typography

Fonts were identified by eye from small, compressed text. Treat the families below as the nearest free match, and ask the owner for the originals.

### Wordmark
Heavy, extra-wide grotesque with sharp angular cuts on K, R and A. It's custom-looking, so **use the supplied logo file, never retype it**. Always paired with a superscript ® at the top right, set in the same color.

### Display and labels
Extended (wide) heavy sans, all caps. Seen in the palette names (OBSIDIAN, GRAPHITE...) and poster lines like "WORLDWIDE" and "INDIVIDUALITY".
- Closest free options: **Unbounded**, **Syne ExtraBold**, **Archivo Expanded Black**
- Case: uppercase
- Tracking: 0 to +2%
- Line height: 0.95 to 1.05

### Body and micro-copy
Monospace, small, in uppercase for labels and sentence case for paragraphs. Seen in specs, tag text, coordinates-style metadata, and the "A STUDY IN DETAIL" block (red bold caps heading, italic subtitle).
- Closest free options: **JetBrains Mono**, **Space Mono**, **IBM Plex Mono**
- Sizes: 10 to 12px labels, 14 to 16px body on web
- Label tracking: +6% to +10%

### Scale (web starting point)

| Style | Size / line | Weight | Face |
|---|---|---|---|
| Hero | clamp(64px, 18vw, 240px) / 0.9 | 800+ | Wordmark or extended sans |
| H1 | 48 / 52 | 800 | Extended sans |
| H2 | 28 / 32 | 800 | Extended sans |
| Label | 11 / 16 | 500 | Mono, uppercase, +8% |
| Body | 15 / 24 | 400 | Mono |
| Caption | 12 / 16 | 400 | Mono, Stonewash |

---

## 4. Graphic language

- **Oversized wordmark.** Used cropped, bleeding off the edge of red or black panels. On the hero it spans the full width.
- **Registered mark.** ® after the name, everywhere.
- **Double-slash separators.** `Made to Represent // Mark of Identity`, `(CONTACT) // +63 ...`. Use `//` in breadcrumbs, metadata rows and footers.
- **Parentheses on labels.** `(CONTACT)`, small and mono.
- **Grain.** The white backgrounds carry a subtle speckle/noise texture. Add it as a low-opacity PNG overlay (3 to 5%) on Paper sections.
- **Construction lines.** Dotted guide lines around a grey ghost logo, used in the identity-grid section. Good for an "About" or "Brand" page.
- **Tape.** Black and red woven tape with the wordmark repeating, diagonal and vertical. Works as a marquee strip or section divider.
- **Tag system.** Hang tags (black, QR code, wordmark rotated 90°), a narrow red extra tag reading "PATTERN SERIES", neck-label tiles, and a red "K" monogram patch. The "K" monogram is the favicon and app-icon candidate.
- **Corners.** Square. No rounded corners anywhere in the source.
- **Rules.** 1px hairlines in Stonewash on Paper, Graphite on Obsidian.

---

## 5. Photography and imagery

- Dark studio, single figure, motion-blurred repeats of the same model walking behind them. Red wordmark overhead.
- Earth-tone streetwear (khaki puffer, camo cargo) against black, so red is the only saturated color.
- Product shots on white: red rigid box with black interior, red shopping bag with black handles, white tees with red or black print.
- Lifestyle: cropped faces, hands covering the face, oversized white hoodies. Identity-focused, the face is rarely shown.
- Environmental: red roller shutter storefront at dusk, poster walls in black, white and red.
- Grade: high contrast, crushed blacks, no warm filter.

---

## 6. E-commerce translation

The video shows brand identity only. No store UI appeared, so everything below is my adaptation of that identity.

**Layout**
- 12-column grid, 24px gutters, 80px section spacing on desktop.
- Hero: full-bleed Obsidian, giant red wordmark cropped at the top, model photo centered.
- Alternate Obsidian and Paper sections. Use one Red section per page at most.

**Navigation**
- Obsidian or Paper bar, wordmark left, mono uppercase links, cart as `(0)`.
- Active link underlined in Red, 2px.

**Buttons**
- Primary: Red fill, Paper text, square corners, mono uppercase label, 16px/32px padding. Hover: `--kral-red-press`.
- Secondary: 1px Obsidian outline, transparent fill. Hover fills Obsidian with Paper text.
- On dark: Paper outline, same hover inversion.

**Product card**
- Porcelain image tile, no shadow, no radius.
- Name in extended sans caps, price in mono.
- Small mono tag top left: `(NEW)`, `PATTERN SERIES`. Sold-out tag in Stonewash.
- Hover: image swaps to the alternate shot, a thin Red underline appears under the name.

**Product page**
- Spec table in mono with hairline rows (material, fit, care), echoing the hang-tag layout.
- Size selector as square outlined chips, selected state filled Obsidian.
- A QR-style detail (care/authenticity link) near the bottom as a brand nod.

**Cart and checkout**
- Paper background, hairline dividers, Red only on the final CTA.

**Footer**
- Obsidian, giant cropped wordmark across the bottom edge, mono contact lines using `//` separators.

**Motion**
- Marquee tape strips scrolling at a steady linear pace.
- Hero model repeats fading in with a slight horizontal blur, mirroring the video.
- Transitions are short (150 to 200ms), `ease-out`. No bounces.

---

## 7. Voice

Short, declarative, uppercase labels. Nouns over adjectives.

Examples from the source: `A STUDY IN DETAIL`, `INDIVIDUALITY`, `WORLDWIDE`, `CREATIVE DEPARTMENT`, `HANG TAG`, `EXTRA TAG`, `Made to Represent`, `Mark of Identity`.

Body copy talks about street culture, the people behind the brand, and details like tags and typography. Keep it plain and confident.

---

## 8. Do and don't

**Do**
- Use real logo files, with ® attached.
- Keep red scarce and saturated.
- Pair mono micro-labels with big extended headlines.
- Keep every corner square.

**Don't**
- Use pure white or pure black backgrounds.
- Put Red text on Obsidian at body sizes.
- Add gradients, drop shadows or rounded cards.
- Introduce a second accent color.

---

## 9. Open questions for the owner

1. Is the name KRAL or KRUL?
2. Official hex/RGB/CMYK values (the swatch captions were unreadable in the recording).
3. Font licences for the wordmark, display face and mono.
4. Is the Behance case study the owner's own commissioned identity, or a reference they like? The credit on screen is Francis Gomez, so make sure the brand assets are cleared for client use.
5. Do they have an actual store design, or is the identity the only thing so far?
