export type SheetRow = Record<string, string | number | boolean | null>
export type GvizCellValue = string | number | boolean | null
export type GvizCell = { v: GvizCellValue; f?: string }
export type GvizRow = { c: Array<GvizCell | null> }
export type GvizCol = { label?: string }
export type GvizTable = { cols: GvizCol[]; rows: GvizRow[] }

function getRequiredEnv(name: string): string {
  const value = import.meta.env[name]
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} 환경 변수가 필요합니다.`)
  }
  return value
}

type GvizResponse = {
  table: GvizTable
}

function parseGoogleVisualizationResponse(rawText: string): GvizResponse {
  const match = rawText.match(/setResponse\((.*)\);?$/s)
  if (!match || !match[1]) {
    throw new Error('Google Sheets 응답을 파싱할 수 없습니다.')
  }

  return JSON.parse(match[1]) as GvizResponse
}

export async function fetchGoogleSheetRows(): Promise<SheetRow[]> {
  const sheetId = getRequiredEnv('VITE_GOOGLE_SHEET_ID')
  const gid = import.meta.env.VITE_GOOGLE_SHEET_GID
  const sheetName = import.meta.env.VITE_GOOGLE_SHEET_NAME || 'Sheet1'
  const query = import.meta.env.VITE_GOOGLE_SHEET_QUERY || 'select *'

  const baseUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`
  const sheetParam =
    gid && typeof gid === 'string'
      ? `gid=${encodeURIComponent(gid)}`
      : `sheet=${encodeURIComponent(sheetName)}`
  const url = `${baseUrl}?${sheetParam}&tq=${encodeURIComponent(query)}&tqx=out:json`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Google Sheets 요청 실패: ${response.status}`)
  }

  const text = await response.text()
  const parsed = parseGoogleVisualizationResponse(text).table
  const headers = parsed.cols.map((column, index) =>
    column.label && column.label.trim() ? column.label.trim() : `column_${index + 1}`,
  )

  return parsed.rows.map((row) => {
    const entry: SheetRow = {}
    headers.forEach((header, index) => {
      const cell = row.c[index]
      entry[header] = cell?.v ?? null
    })
    return entry
  })
}

export async function fetchGoogleSheetTableByGid(gid: string): Promise<GvizTable> {
  const sheetId = getRequiredEnv('VITE_GOOGLE_SHEET_ID')
  const query = import.meta.env.VITE_GOOGLE_SHEET_QUERY || 'select *'

  const url =
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq` +
    `?gid=${encodeURIComponent(gid)}` +
    `&tq=${encodeURIComponent(query)}` +
    '&tqx=out:json'

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Google Sheets 요청 실패: ${response.status}`)
  }

  const text = await response.text()
  return parseGoogleVisualizationResponse(text).table
}
