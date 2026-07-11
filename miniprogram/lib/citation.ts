// 论文引用格式生成 —— 移植自 Web shared/lib/citation.ts(1:1 算法)。
// 5 格式:GB/T 7714 / BibTeX / APA / MLA / Chicago。小程序展示去掉 <i> 斜体标记(纯文本)。

export interface CitationAuthor {
  name?: string
}
export interface CitationPaper {
  title?: string
  authors?: CitationAuthor[]
  year?: number | string
  venue?: string
  journal?: { volume?: string; pages?: string }
}
export type CitationFormat = 'gbt7714' | 'bibtex' | 'apa' | 'mla' | 'chicago'

export const CITATION_FORMATS: { id: CitationFormat; label: string }[] = [
  { id: 'gbt7714', label: 'GB/T 7714' },
  { id: 'bibtex', label: 'BibTeX' },
  { id: 'apa', label: 'APA' },
  { id: 'mla', label: 'MLA' },
  { id: 'chicago', label: 'Chicago' },
]

const STOP_WORDS = new Set(['of', 'the', 'in', 'for', 'and', 'a', 'an', 'to', 'on'])
function authorName(a?: CitationAuthor): string {
  return (a && a.name ? a.name : '').trim()
}

function bibtex(p: CitationPaper): string {
  const authors = p.authors || []
  const title = p.title || 'Untitled'
  const year = p.year ?? 'n.d.'
  const venue = p.venue || ''
  const volume = (p.journal && p.journal.volume) || ''
  const pages = (p.journal && p.journal.pages) || ''
  const first = authorName(authors[0]) || 'Unknown'
  const lastName = first.split(/\s+/).pop() || first
  const words = title.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))
  const w1 = (words[0] || 'Paper').replace(/[^a-zA-Z]/g, '') || 'Paper'
  const w2 = ((words[1] || '').replace(/[^a-zA-Z]/g, '') || '').slice(0, 2).toUpperCase()
  const key = '' + lastName + year + w1 + w2
  let out = '@article{' + key + ',\n  title={' + title + '},\n  author={' + authors.map(authorName).filter(Boolean).join(' and ') + '}'
  if (venue) out += ',\n  journal={' + venue + '}'
  if (year) out += ',\n  year={' + year + '}'
  if (volume) out += ',\n  volume={' + volume + '}'
  if (pages) out += ',\n  pages={' + pages + '}'
  return out + '\n}'
}

function mla(p: CitationPaper): string {
  const authors = p.authors || []
  const title = p.title || 'Untitled'
  const year = p.year ?? 'n.d.'
  const venue = p.venue || ''
  const volume = (p.journal && p.journal.volume) || ''
  const pages = (p.journal && p.journal.pages) || ''
  let a = 'Unknown'
  if (authors.length) {
    const fn = authorName(authors[0])
    const parts = fn.split(/\s+/)
    const fmt = parts.length > 1 ? parts[parts.length - 1] + ', ' + parts.slice(0, -1).join(' ') : fn
    a = authors.length === 1 ? fmt : authors.length === 2 ? fmt + ', and ' + authorName(authors[1]) : fmt + ' et al.'
  }
  let out = a + '. "' + title + '."'
  if (venue) out += ' ' + venue
  if (volume) out += ' ' + volume
  if (year && pages) out += ' (' + year + '): ' + pages
  else if (year) out += ' (' + year + ')'
  else if (pages) out += ': ' + pages
  return out + '.'
}

function apa(p: CitationPaper): string {
  const authors = p.authors || []
  const title = p.title || 'Untitled'
  const year = p.year ?? 'n.d.'
  const venue = p.venue || ''
  const volume = (p.journal && p.journal.volume) || ''
  const pages = (p.journal && p.journal.pages) || ''
  let a = 'Unknown'
  if (authors.length) {
    const fmt = authors.map((x) => {
      const name = authorName(x)
      const parts = name.split(/\s+/)
      if (parts.length > 1) return parts[parts.length - 1] + ', ' + parts.slice(0, -1).map((n) => n[0] + '.').join(' ')
      return name
    })
    a = fmt.length === 1 ? fmt[0] : fmt.length === 2 ? fmt[0] + ', & ' + fmt[1] : fmt.slice(0, -1).join(', ') + ', & ' + fmt[fmt.length - 1]
  }
  let out = a + ' (' + year + '). ' + title + '.'
  if (venue && volume) out += ' ' + venue + ', ' + volume
  else if (venue) out += ' ' + venue
  else if (volume) out += ' ' + volume
  if (pages) out += ', ' + pages
  return out + '.'
}

function chicago(p: CitationPaper): string {
  const authors = p.authors || []
  const title = p.title || 'Untitled'
  const year = p.year ?? 'n.d.'
  const venue = p.venue || ''
  const volume = (p.journal && p.journal.volume) || ''
  const pages = (p.journal && p.journal.pages) || ''
  let a = 'Unknown'
  if (authors.length) {
    const fmt = authors.map((x) => {
      const name = authorName(x)
      const parts = name.split(/\s+/)
      if (parts.length > 1) return parts[parts.length - 1] + ', ' + parts.slice(0, -1).join(' ')
      return name
    })
    a = fmt.length === 1 ? fmt[0] : fmt.length === 2 ? fmt[0] + ', and ' + fmt[1] : fmt.slice(0, -1).join(', ') + ', and ' + fmt[fmt.length - 1]
  }
  let out = a + '. "' + title + '."'
  if (venue) out += ' ' + venue
  if (volume) out += ' ' + volume
  if (year) out += ' (' + year + ')'
  if (pages) out += ': ' + pages
  return out + '.'
}

function gbtAuthor(a?: CitationAuthor): string {
  const name = authorName(a)
  if (!name) return ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  const surname = parts[parts.length - 1]
  const initials = parts.slice(0, -1).map((x) => (x[0] || '').toUpperCase()).filter(Boolean).join(' ')
  return initials ? surname + ' ' + initials : surname
}

function gbt7714(p: CitationPaper): string {
  const authors = (p.authors || []).map(gbtAuthor).filter(Boolean)
  const title = p.title || 'Untitled'
  const year = p.year ?? ''
  const venue = p.venue || ''
  const volume = (p.journal && p.journal.volume) || ''
  const pages = ((p.journal && p.journal.pages) || '').replace(/[–—]/g, '-').trim()
  let a = ''
  if (authors.length > 0 && authors.length <= 3) a = authors.join(', ')
  else if (authors.length > 3) a = authors.slice(0, 3).join(', ') + ', 等'
  const typeMark = /conference|proceedings|workshop|symposium|congress/i.test(venue) ? '[C]' : '[J]'
  const segs: string[] = []
  if (venue) segs.push(venue)
  const yv: string[] = []
  if (year) yv.push(String(year))
  if (volume) yv.push(volume)
  const yvStr = yv.join(', ')
  if (yvStr) {
    if (segs.length) segs[segs.length - 1] = segs[segs.length - 1] + ', ' + yvStr
    else segs.push(yvStr)
  }
  let tail = segs.join(', ')
  if (pages) tail += (tail ? ': ' : '') + pages
  const head = a ? a + '. ' : ''
  return head + title + typeMark + '.' + (tail ? ' ' + tail + '.' : '')
}

// 生成引用(去 <i> 斜体标记,小程序纯文本展示)。
export function generateCitation(p: CitationPaper, format: CitationFormat): string {
  let s = ''
  switch (format) {
    case 'gbt7714':
      s = gbt7714(p)
      break
    case 'bibtex':
      s = bibtex(p)
      break
    case 'apa':
      s = apa(p)
      break
    case 'mla':
      s = mla(p)
      break
    case 'chicago':
      s = chicago(p)
      break
  }
  return s.replace(/<\/?i>/g, '')
}
