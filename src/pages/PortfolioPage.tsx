import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchGoogleSheetRows, type SheetRow } from '../lib/googleSheets'
import { getUnitDetailBySite } from '../lib/unitDetailRoutes'

type PortfolioUnit = {
  id: string
  site: string
  ownership: string
  tenantStatus: string
  completionDate: string
  contractRenewalRaw: string
  loanRenewalRaw: string
  note: string
  businessNumber: string
  supplyPrice: number | null
  loanAmount: number | null
  interestRate: number | null
  monthlyInterest: number | null
  monthlyRent: number | null
  buildingTax: number | null
  landTax: number | null
  trafficInducementCharge: number | null
}

type RenewalAlert = {
  id: string
  site: string
  kind: '계약갱신' | '대출갱신'
  rawDate: string
  daysLeft: number
}

type PortfolioSummary = {
  totalUnits: number
  leasedUnits: number
  totalSupplyPrice: number
  totalLoanAmount: number
  totalEquity: number
  avgInterestRate: number | null
  monthlyRentIncome: number
  monthlyInterestCost: number
  monthlyNetCashflow: number
  annualNetCashflow: number
  annualReturnOnEquity: number | null
  loanToValue: number | null
}

type TaxSummary = {
  buildingTaxTotal: number
  landTaxTotal: number
  trafficChargeTotal: number
  annualTaxTotal: number
}

const krwFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
const percentFormat = new Intl.NumberFormat('ko-KR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  const normalized = value.replace(/[^\d.-]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function findLikelyColumn(columns: string[], keys: string[]): string {
  const lowered = columns.map((column) => ({
    original: column,
    lowered: column.toLowerCase(),
  }))

  for (const key of keys) {
    const found = lowered.find((column) => column.lowered.includes(key))
    if (found) return found.original
  }

  return ''
}

function parseKoreanDate(raw: string): Date | null {
  const match = raw.match(/(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!match) return null

  let year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  if (year < 100) {
    year += 2000
  }

  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function calculateDaysLeft(rawDate: string): number | null {
  const parsed = parseKoreanDate(rawDate)
  if (!parsed) return null

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  const diffMs = target.getTime() - startOfToday.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function toPortfolioUnits(rows: SheetRow[]): PortfolioUnit[] {
  if (rows.length === 0) return []
  const columns = Object.keys(rows[0])

  const siteColumn = findLikelyColumn(columns, ['현장', '호실', 'site'])
  const completionColumn = findLikelyColumn(columns, ['준공일', 'completion'])
  const supplyColumn = findLikelyColumn(columns, ['공급금액', '매입', 'price'])
  const loanColumn = findLikelyColumn(columns, ['대출금', 'loan'])
  const rateColumn = findLikelyColumn(columns, ['이율', '금리', 'rate'])
  const interestColumn = findLikelyColumn(columns, ['대출이자', 'interest'])
  const rentColumn = findLikelyColumn(columns, ['월세', '임대료', 'rent'])
  const contractRenewalColumn = findLikelyColumn(columns, ['계약갱신', '계약 갱신'])
  const loanRenewalColumn = findLikelyColumn(columns, ['대출갱신', '대출 갱신'])
  const ownershipColumn = findLikelyColumn(columns, ['명의'])
  const tenantColumn = findLikelyColumn(columns, ['실입주 여부', '입주', '임대'])
  const noteColumn = findLikelyColumn(columns, ['비고', 'note'])
  const businessNumberColumn = findLikelyColumn(columns, ['사업자등록번호'])
  const buildingTaxColumn = findLikelyColumn(columns, ['재산세', '건문불'])
  const landTaxColumn = findLikelyColumn(columns, ['토지분'])
  const trafficChargeColumn = findLikelyColumn(columns, ['교통유발부담금'])

  const sumRowIndex = rows.findIndex((row) =>
    String(row[siteColumn] ?? '')
      .replace(/\s+/g, '')
      .includes('합계'),
  )

  const sourceRows = (sumRowIndex >= 0 ? rows.slice(0, sumRowIndex) : rows).filter((row) => {
    const site = String(row[siteColumn] ?? '').trim()
    return site.length > 0
  })

  return sourceRows.map((row, index) => ({
    id: `unit-${index}`,
    site: String(row[siteColumn] ?? `호실 ${index + 1}`),
    ownership: String(row[ownershipColumn] ?? '-'),
    tenantStatus: String(row[tenantColumn] ?? '-'),
    completionDate: String(row[completionColumn] ?? '-'),
    contractRenewalRaw: String(row[contractRenewalColumn] ?? ''),
    loanRenewalRaw: String(row[loanRenewalColumn] ?? ''),
    note: String(row[noteColumn] ?? '-'),
    businessNumber: String(row[businessNumberColumn] ?? '-'),
    supplyPrice: parseNumericValue(row[supplyColumn]),
    loanAmount: parseNumericValue(row[loanColumn]),
    interestRate: parseNumericValue(row[rateColumn]),
    monthlyInterest: parseNumericValue(row[interestColumn]),
    monthlyRent: parseNumericValue(row[rentColumn]),
    buildingTax: parseNumericValue(row[buildingTaxColumn]),
    landTax: parseNumericValue(row[landTaxColumn]),
    trafficInducementCharge: parseNumericValue(row[trafficChargeColumn]),
  }))
}

function summarizeTaxes(units: PortfolioUnit[]): TaxSummary {
  const buildingTaxTotal = units.reduce((acc, unit) => acc + (unit.buildingTax ?? 0), 0)
  const landTaxTotal = units.reduce((acc, unit) => acc + (unit.landTax ?? 0), 0)
  const trafficChargeTotal = units.reduce(
    (acc, unit) => acc + (unit.trafficInducementCharge ?? 0),
    0,
  )
  return {
    buildingTaxTotal,
    landTaxTotal,
    trafficChargeTotal,
    annualTaxTotal: buildingTaxTotal + landTaxTotal + trafficChargeTotal,
  }
}

function summarizePortfolio(units: PortfolioUnit[]): PortfolioSummary {
  if (units.length === 0) {
    return {
      totalUnits: 0,
      leasedUnits: 0,
      totalSupplyPrice: 0,
      totalLoanAmount: 0,
      totalEquity: 0,
      avgInterestRate: null,
      monthlyRentIncome: 0,
      monthlyInterestCost: 0,
      monthlyNetCashflow: 0,
      annualNetCashflow: 0,
      annualReturnOnEquity: null,
      loanToValue: null,
    }
  }

  const totalSupplyPrice = units.reduce((acc, unit) => acc + (unit.supplyPrice ?? 0), 0)
  const totalLoanAmount = units.reduce((acc, unit) => acc + (unit.loanAmount ?? 0), 0)
  const totalEquity = totalSupplyPrice - totalLoanAmount
  const monthlyRentIncome = units.reduce((acc, unit) => acc + (unit.monthlyRent ?? 0), 0)
  const monthlyInterestCost = units.reduce(
    (acc, unit) => acc + (unit.monthlyInterest ?? 0),
    0,
  )
  const monthlyNetCashflow = monthlyRentIncome - monthlyInterestCost
  const annualNetCashflow = monthlyNetCashflow * 12

  const weightedRateBase = units.filter(
    (unit) => unit.interestRate !== null && unit.loanAmount !== null && unit.loanAmount > 0,
  )
  const weightedRateDenom = weightedRateBase.reduce(
    (acc, unit) => acc + (unit.loanAmount as number),
    0,
  )
  const weightedRateNumerator = weightedRateBase.reduce(
    (acc, unit) => acc + (unit.loanAmount as number) * (unit.interestRate as number),
    0,
  )
  const avgInterestRate =
    weightedRateDenom > 0 ? weightedRateNumerator / weightedRateDenom : null

  const leasedUnits = units.filter((unit) => {
    const value = unit.tenantStatus.toLowerCase()
    return value.includes('임대') || value.includes('입주') || value.includes('운영')
  }).length

  const annualReturnOnEquity = totalEquity > 0 ? annualNetCashflow / totalEquity : null
  const loanToValue = totalSupplyPrice > 0 ? totalLoanAmount / totalSupplyPrice : null

  return {
    totalUnits: units.length,
    leasedUnits,
    totalSupplyPrice,
    totalLoanAmount,
    totalEquity,
    avgInterestRate,
    monthlyRentIncome,
    monthlyInterestCost,
    monthlyNetCashflow,
    annualNetCashflow,
    annualReturnOnEquity,
    loanToValue,
  }
}

function buildRenewalAlerts(units: PortfolioUnit[]): RenewalAlert[] {
  const alerts: RenewalAlert[] = []

  for (const unit of units) {
    const contractDays = calculateDaysLeft(unit.contractRenewalRaw)
    if (contractDays !== null && contractDays >= 0 && contractDays <= 120) {
      alerts.push({
        id: `${unit.id}-contract`,
        site: unit.site,
        kind: '계약갱신',
        rawDate: unit.contractRenewalRaw,
        daysLeft: contractDays,
      })
    }

    const loanDays = calculateDaysLeft(unit.loanRenewalRaw)
    if (loanDays !== null && loanDays >= 0 && loanDays <= 120) {
      alerts.push({
        id: `${unit.id}-loan`,
        site: unit.site,
        kind: '대출갱신',
        rawDate: unit.loanRenewalRaw,
        daysLeft: loanDays,
      })
    }
  }

  return alerts.sort((a, b) => a.daysLeft - b.daysLeft)
}

function formatCurrency(value: number): string {
  return `${krwFormat.format(Math.round(value))}원`
}

export default function PortfolioPage() {
  const [rows, setRows] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const units = useMemo(() => toPortfolioUnits(rows), [rows])
  const summary = useMemo(() => summarizePortfolio(units), [units])
  const taxSummary = useMemo(() => summarizeTaxes(units), [units])
  const renewalAlerts = useMemo(() => buildRenewalAlerts(units), [units])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchGoogleSheetRows()
      setRows(data)
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : '데이터를 불러오는 중 오류가 발생했습니다.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="badge">KNOWLEDGE INDUSTRY CENTER PORTFOLIO</p>
          <h1>보유 호실 투자관리 대시보드</h1>
          <p className="subtitle">
            월세 수입, 이자 비용, 자기자본수익률(ROE), 갱신 일정을 한눈에 관리합니다.
          </p>
        </div>
        <button className="refreshButton" onClick={loadData} disabled={loading}>
          {loading ? '불러오는 중...' : '새로고침'}
        </button>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="metricGrid">
        <article className="metricCard">
          <p className="label">보유 호실</p>
          <p className="value">{summary.totalUnits}개</p>
        </article>
        <article className="metricCard">
          <p className="label">총 투자금(공급금액)</p>
          <p className="value">{formatCurrency(summary.totalSupplyPrice)}</p>
        </article>
        <article className="metricCard">
          <p className="label">총 대출금 / LTV</p>
          <p className="value">{formatCurrency(summary.totalLoanAmount)}</p>
          <p className="subValue">
            LTV {summary.loanToValue === null ? '-' : percentFormat.format(summary.loanToValue)}
          </p>
        </article>
        <article className="metricCard">
          <p className="label">월 임대수입</p>
          <p className="value">{formatCurrency(summary.monthlyRentIncome)}</p>
        </article>
        <article className="metricCard">
          <p className="label">월 대출이자</p>
          <p className="value">{formatCurrency(summary.monthlyInterestCost)}</p>
        </article>
        <article className="metricCard">
          <p className="label">월 순현금흐름</p>
          <p className={`value ${summary.monthlyNetCashflow < 0 ? 'negative' : ''}`}>
            {formatCurrency(summary.monthlyNetCashflow)}
          </p>
          <p className="subValue">연 환산 {formatCurrency(summary.annualNetCashflow)}</p>
        </article>
      </section>

      <section className="highlightGrid">
        <article className="highlightCard">
          <h2>수익성 요약</h2>
          <div className="kvList">
            <p>
              <span>자기자본</span>
              <strong>{formatCurrency(summary.totalEquity)}</strong>
            </p>
            <p>
              <span>평균 대출이율(가중)</span>
              <strong>
                {summary.avgInterestRate === null
                  ? '-'
                  : percentFormat.format(summary.avgInterestRate)}
              </strong>
            </p>
            <p>
              <span>연 자기자본수익률(ROE)</span>
              <strong>
                {summary.annualReturnOnEquity === null
                  ? '-'
                  : percentFormat.format(summary.annualReturnOnEquity)}
              </strong>
            </p>
            <p>
              <span>임대/운영 중 호실</span>
              <strong>
                {summary.leasedUnits} / {summary.totalUnits}
              </strong>
            </p>
          </div>
        </article>

        <article className="highlightCard">
          <h2>갱신 알림 (120일 이내)</h2>
          {renewalAlerts.length === 0 ? (
            <p className="emptyText">가까운 일정이 없습니다.</p>
          ) : (
            <ul className="alertList">
              {renewalAlerts.map((alert) => (
                <li key={alert.id}>
                  <span className="alertType">{alert.kind}</span>
                  <span>{alert.site}</span>
                  <span>{alert.rawDate}</span>
                  <strong>D-{alert.daysLeft}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="tableSection">
        <div className="tableHeader">
          <h2>호실별 손익/레버리지</h2>
          <p>{units.length > 0 ? `${units.length}개 호실 로드됨` : '데이터 없음'}</p>
        </div>
        <div className="tableContainer">
          <table>
            <thead>
              <tr>
                <th>현장</th>
                <th>명의</th>
                <th>공급금액</th>
                <th>대출금</th>
                <th>이율</th>
                <th>월세</th>
                <th>월이자</th>
                <th>월 순현금흐름</th>
                <th>연 ROE</th>
                <th>실입주</th>
                <th>사업자번호</th>
                <th>계약갱신</th>
                <th>대출갱신</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => {
                const detail = getUnitDetailBySite(unit.site)
                const equity =
                  (unit.supplyPrice ?? 0) > 0 ? (unit.supplyPrice ?? 0) - (unit.loanAmount ?? 0) : 0
                const monthlyNet = (unit.monthlyRent ?? 0) - (unit.monthlyInterest ?? 0)
                const unitRoe = equity > 0 ? (monthlyNet * 12) / equity : null

                return (
                  <tr key={unit.id}>
                    <td>
                      {detail ? (
                        <Link className="unitLink" to={`/units/${detail.slug}`}>
                          {unit.site}
                        </Link>
                      ) : (
                        unit.site
                      )}
                    </td>
                    <td>{unit.ownership}</td>
                    <td>{unit.supplyPrice === null ? '-' : formatCurrency(unit.supplyPrice)}</td>
                    <td>{unit.loanAmount === null ? '-' : formatCurrency(unit.loanAmount)}</td>
                    <td>
                      {unit.interestRate === null ? '-' : percentFormat.format(unit.interestRate)}
                    </td>
                    <td>{unit.monthlyRent === null ? '-' : formatCurrency(unit.monthlyRent)}</td>
                    <td>
                      {unit.monthlyInterest === null
                        ? '-'
                        : formatCurrency(unit.monthlyInterest)}
                    </td>
                    <td className={monthlyNet < 0 ? 'negativeCell' : ''}>
                      {formatCurrency(monthlyNet)}
                    </td>
                    <td>{unitRoe === null ? '-' : percentFormat.format(unitRoe)}</td>
                    <td>{unit.tenantStatus}</td>
                    <td>
                      <details className="inlineDisclosure">
                        <summary>확인</summary>
                        <div>{unit.businessNumber || '-'}</div>
                      </details>
                    </td>
                    <td>{unit.contractRenewalRaw || '-'}</td>
                    <td>{unit.loanRenewalRaw || '-'}</td>
                    <td>{unit.note}</td>
                  </tr>
                )
              })}
              {units.length === 0 ? (
                <tr>
                  <td colSpan={14} className="emptyRow">
                    표시할 데이터가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tableSection">
        <div className="tableHeader">
          <h2>세금 항목</h2>
          <p>기본 접힘 상태, 클릭 시 펼침</p>
        </div>
        <div className="taxSummaryGrid">
          <p>
            <span>재산세(건물분) 합계</span>
            <strong>{formatCurrency(taxSummary.buildingTaxTotal)}</strong>
          </p>
          <p>
            <span>재산세(토지분) 합계</span>
            <strong>{formatCurrency(taxSummary.landTaxTotal)}</strong>
          </p>
          <p>
            <span>교통유발부담금 합계</span>
            <strong>{formatCurrency(taxSummary.trafficChargeTotal)}</strong>
          </p>
          <p>
            <span>연간 세금 총합</span>
            <strong>{formatCurrency(taxSummary.annualTaxTotal)}</strong>
          </p>
        </div>
        <div className="disclosureList">
          {units.map((unit) => (
            <details key={`${unit.id}-tax`} className="disclosureCard">
              <summary>
                <span>{unit.site}</span>
                <span>세금 보기</span>
              </summary>
              <div className="disclosureBody">
                <p>
                  <span>재산세(건물분)</span>
                  <strong>
                    {unit.buildingTax === null ? '-' : formatCurrency(unit.buildingTax)}
                  </strong>
                </p>
                <p>
                  <span>재산세(토지분)</span>
                  <strong>{unit.landTax === null ? '-' : formatCurrency(unit.landTax)}</strong>
                </p>
                <p>
                  <span>교통유발부담금</span>
                  <strong>
                    {unit.trafficInducementCharge === null
                      ? '-'
                      : formatCurrency(unit.trafficInducementCharge)}
                  </strong>
                </p>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
