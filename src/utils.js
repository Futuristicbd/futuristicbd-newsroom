const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(iso, withYear) {
  const p = String(iso || '').split('-')
  if (p.length !== 3) return iso
  const m = MONTHS[(+p[1]) - 1] || p[1]
  return m + ' ' + (+p[2]) + (withYear ? ', ' + p[0] : '')
}

export function cap(s) {
  s = String(s || '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
