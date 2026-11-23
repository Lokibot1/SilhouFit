/** The neutral shape of a report: the Excel and PDF writers both draw it, so the two files always hold the same figures. */
export interface ReportColumn {
  label: string
  align?: 'left' | 'right'
  /** `money` is PHP with two decimals; `int` a whole number. Text when absent. */
  kind?: 'money' | 'int'
}
export type ReportCell = string | number

export interface ReportSection {
  heading: string
  note?: string
  columns: ReportColumn[]
  rows: ReportCell[][]
  /** A closing row, as long as the columns or shorter (the rest stays empty). */
  total?: ReportCell[]
  /** Shown instead of the table when there are no rows. */
  empty: string
}

export interface ReportDoc {
  title: string
  /** The file name without its date or extension. */
  filename: string
  /** Label and value lines under the title. */
  info: [string, string][]
  sections: ReportSection[]
}

export interface ReportMeta {
  exportedBy: { name?: string; email?: string }
  exportedAt: Date
}

/** The company's channels, drawn in the PDF footer and the sheets. */
export const SOCIAL_LINKS = [
  { name: 'Facebook', href: 'https://www.facebook.com/share/1E2aLE2NCR/' },
  { name: 'Instagram', href: 'https://www.instagram.com/kralzurcstuff?mdxt=MWNrdTFkbGF2N3JjNw==' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@kralzurcstuff?_r=1&_t=ZS-9BEh1UUUEXE' },
  { name: 'Shopee', href: 'https://ph.shp.ee/v9ZZMB9C' },
  { name: 'Lazada', href: 'https://s.lazada.com.ph/s.ZqNO6c' },
] as const
