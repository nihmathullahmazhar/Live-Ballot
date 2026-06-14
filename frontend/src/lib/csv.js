// Tiny CSV exporter — turns an array of objects into a downloadable .csv (opens in Excel).
function esc(v) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCSV(rows, columns) {
  if (!rows || rows.length === 0) return ''
  const cols = columns && columns.length
    ? columns
    : Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
  const head = cols.map((c) => esc(c.label)).join(',')
  const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(',')).join('\r\n')
  return head + '\r\n' + body
}

export function downloadCSV(filename, rows, columns) {
  const csv = toCSV(rows, columns)
  if (!csv) return false
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}