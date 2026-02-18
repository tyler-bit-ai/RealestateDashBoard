import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchGoogleSheetTableByGid,
  type GvizCell,
  type GvizTable,
} from '../lib/googleSheets'
import { getUnitDetailBySlug } from '../lib/unitDetailRoutes'

type UnitScenario = {
  ltv: string
  loanAmount: number | null
  equity: number | null
  deposit: number | null
  fixedCost: number | null
  investedTotal: number | null
  monthlyRent: number | null
  monthlyInterest: number | null
  monthlyNet: number | null
  monthlyRoi: number | null
  annualProfit: number | null
  annualRoi: number | null
}

const krwFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
const percentFormat = new Intl.NumberFormat('ko-KR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function cellToString(cell: GvizCell | null | undefined): string {
  if (!cell) return ''
  if (cell.f && cell.f.trim()) return cell.f.trim()
  if (cell.v === null || cell.v === undefined) return ''
  return String(cell.v).trim()
}

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function findCellByKeyword(table: GvizTable, keyword: string): { row: number; col: number } | null {
  const target = normalize(keyword)
  const rows = table.rows ?? []
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].c ?? []
    for (let c = 0; c < cells.length; c++) {
      if (normalize(cellToString(cells[c])).includes(target)) {
        return { row: r, col: c }
      }
    }
  }
  return null
}

function getNumericAt(table: GvizTable, row: number, col: number): number | null {
  const cell = table.rows?.[row]?.c?.[col] ?? null
  const fromValue = toNumber(cell?.v as string | number | null)
  if (fromValue !== null) return fromValue
  return toNumber(cellToString(cell))
}

function getNumericBelow(
  table: GvizTable,
  anchor: { row: number; col: number },
  maxDepth = 4,
): number | null {
  for (let offset = 1; offset <= maxDepth; offset++) {
    const value = getNumericAt(table, anchor.row + offset, anchor.col)
    if (value !== null) return value
  }
  return null
}

function getRegistrationHeuristic(
  table: GvizTable,
  anchor: { row: number; col: number } | null,
): number | null {
  if (!anchor) return null
  const row = table.rows?.[anchor.row + 1]
  const cells = row?.c ?? []
  const numbers: number[] = []

  for (let c = anchor.col; c < cells.length; c++) {
    const value = toNumber(cells[c]?.v as string | number | null) ?? toNumber(cellToString(cells[c]))
    if (value !== null) {
      numbers.push(value)
    }
  }

  if (numbers.length === 0) return null
  if (numbers.length >= 3) return numbers[2]
  return numbers[numbers.length - 1]
}

function toNumber(value: string | number | null): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[^\d.-]/g, '')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrency(value: number | null): string {
  if (value === null) return '-'
  return `${krwFormat.format(Math.round(value))}원`
}

function formatPercent(value: number | null): string {
  if (value === null) return '-'
  return percentFormat.format(value)
}

function parseDetail(table: GvizTable) {
  const rows = table.rows ?? []
  const getCell = (r: number, c: number) => rows[r]?.c?.[c] ?? null

  const depositLabel = findCellByKeyword(table, '보증금')
  const rentLabel = findCellByKeyword(table, '월세')
  const rentPerPyeongLabel = findCellByKeyword(table, '평당월세')
  const acquisitionTaxLabel = findCellByKeyword(table, '취등록세')
  const registrationLabel = findCellByKeyword(table, '등기비용')

  const leaseDeposit =
    depositLabel !== null ? getNumericBelow(table, depositLabel) : toNumber(cellToString(getCell(8, 1)))
  const monthlyRent =
    rentLabel !== null
      ? getNumericBelow(table, rentLabel)
      : depositLabel !== null
        ? getNumericAt(table, depositLabel.row + 1, depositLabel.col + 1)
        : toNumber(cellToString(getCell(8, 2)))
  const monthlyRentPerPyeong =
    rentPerPyeongLabel !== null
      ? getNumericBelow(table, rentPerPyeongLabel)
      : rentLabel !== null
        ? getNumericAt(table, rentLabel.row + 1, rentLabel.col + 1)
        : depositLabel !== null
          ? getNumericAt(table, depositLabel.row + 1, depositLabel.col + 2)
          : null

  const scenarios: UnitScenario[] = rows
    .filter((row) => cellToString(row.c?.[1]).includes('%'))
    .map((row) => {
      const c = row.c ?? []
      return {
        ltv: cellToString(c[1]) || '-',
        loanAmount: toNumber(cellToString(c[2])),
        equity: toNumber(c[3]?.v as string | number | null),
        deposit: toNumber(c[4]?.v as string | number | null),
        fixedCost: toNumber(c[5]?.v as string | number | null),
        investedTotal: toNumber(c[6]?.v as string | number | null),
        monthlyRent: toNumber(c[7]?.v as string | number | null),
        monthlyInterest: toNumber(c[8]?.v as string | number | null),
        monthlyNet: toNumber(c[9]?.v as string | number | null),
        monthlyRoi: toNumber(c[10]?.v as string | number | null),
        annualProfit: toNumber(c[11]?.v as string | number | null),
        annualRoi: toNumber(c[12]?.v as string | number | null),
      }
    })

  const registrationFromAcquisitionTax =
    acquisitionTaxLabel !== null ? getNumericBelow(table, acquisitionTaxLabel) : null
  const registrationFromScenario = scenarios.length > 0 ? scenarios[0].fixedCost : null
  const registrationFallback = getRegistrationHeuristic(table, registrationLabel)

  return {
    warningText: table.cols[1]?.label ?? '',
    building: {
      supplyAreaPyeong: cellToString(getCell(0, 1)),
      exclusiveAreaPyeong: cellToString(getCell(0, 2)),
      exclusiveRatio: toNumber(getCell(0, 3)?.v as string | number | null),
      landPrice: toNumber(getCell(0, 4)?.v as string | number | null),
      buildingPrice: toNumber(getCell(0, 5)?.v as string | number | null),
      pricePerPyeong: toNumber(getCell(0, 6)?.v as string | number | null),
      supplyAmount: toNumber(getCell(0, 7)?.v as string | number | null),
      vat: toNumber(getCell(0, 8)?.v as string | number | null),
      totalAcquisition: toNumber(getCell(0, 9)?.v as string | number | null),
    },
    facility: {
      hvac: cellToString(getCell(5, 1)),
      interior: cellToString(getCell(5, 2)),
    },
    lease: {
      deposit: leaseDeposit,
      monthlyRent,
      monthlyRentPerPyeong,
    },
    otherCosts: {
      registration: registrationFromAcquisitionTax ?? registrationFromScenario ?? registrationFallback,
      brokerage: toNumber(cellToString(getCell(11, 2))),
      propertyBuildingTax: toNumber(cellToString(getCell(12, 1))),
      propertyLandTax: toNumber(cellToString(getCell(12, 2))),
    },
    loanInterestLabel: cellToString(getCell(14, 2)),
    scenarios,
  }
}

export default function UnitDetailPage() {
  const { unitSlug = '' } = useParams()
  const unit = useMemo(() => getUnitDetailBySlug(unitSlug), [unitSlug])
  const [table, setTable] = useState<GvizTable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!unit) {
      setLoading(false)
      return
    }

    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchGoogleSheetTableByGid(unit.gid)
        setTable(data)
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : '상세 데이터를 불러오는 중 오류가 발생했습니다.'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [unit])

  if (!unit) {
    return (
      <div className="page">
        <p className="error">등록되지 않은 호실 상세 페이지입니다.</p>
        <Link className="backLink" to="/">
          대시보드로 돌아가기
        </Link>
      </div>
    )
  }

  const parsed = table ? parseDetail(table) : null
  const baseScenario = parsed?.scenarios[0] ?? null

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="badge">UNIT DETAIL</p>
          <h1>{unit.title}</h1>
          <p className="subtitle">호실별 건물정보, 임대정보, 대출 시나리오 수익률 비교</p>
        </div>
        <Link className="refreshButton asLink" to="/">
          포트폴리오로
        </Link>
      </header>

      {loading ? <p className="emptyText">상세 데이터를 불러오는 중입니다...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {parsed ? (
        <>
          {parsed.warningText ? (
            <section className="tableSection">
              <div className="tableHeader">
                <h2>주의사항</h2>
              </div>
              <p className="subtitle">{parsed.warningText}</p>
            </section>
          ) : null}

          <section className="metricGrid">
            <article className="metricCard">
              <p className="label">공급금액</p>
              <p className="value">{formatCurrency(parsed.building.supplyAmount)}</p>
            </article>
            <article className="metricCard">
              <p className="label">분양금액</p>
              <p className="value">{formatCurrency(parsed.building.totalAcquisition)}</p>
            </article>
            <article className="metricCard">
              <p className="label">월세</p>
              <p className="value">{formatCurrency(parsed.lease.monthlyRent)}</p>
            </article>
            <article className="metricCard">
              <p className="label">월 대출이자 (기준)</p>
              <p className="value">{formatCurrency(baseScenario?.monthlyInterest ?? null)}</p>
            </article>
            <article className="metricCard">
              <p className="label">월 순현금흐름 (기준)</p>
              <p className={`value ${(baseScenario?.monthlyNet ?? 0) < 0 ? 'negative' : ''}`}>
                {formatCurrency(baseScenario?.monthlyNet ?? null)}
              </p>
            </article>
            <article className="metricCard">
              <p className="label">연 수익률 (기준)</p>
              <p className="value">{formatPercent(baseScenario?.annualRoi ?? null)}</p>
            </article>
          </section>

          <section className="highlightGrid">
            <article className="highlightCard">
              <h2>건물 정보</h2>
              <div className="kvList">
                <p>
                  <span>분양면적(평)</span>
                  <strong>{parsed.building.supplyAreaPyeong || '-'}</strong>
                </p>
                <p>
                  <span>전용면적(평)</span>
                  <strong>{parsed.building.exclusiveAreaPyeong || '-'}</strong>
                </p>
                <p>
                  <span>전용률</span>
                  <strong>{formatPercent(parsed.building.exclusiveRatio)}</strong>
                </p>
                <p>
                  <span>평당매매가</span>
                  <strong>{formatCurrency(parsed.building.pricePerPyeong)}</strong>
                </p>
                <p>
                  <span>대지가격</span>
                  <strong>{formatCurrency(parsed.building.landPrice)}</strong>
                </p>
                <p>
                  <span>건물가격</span>
                  <strong>{formatCurrency(parsed.building.buildingPrice)}</strong>
                </p>
              </div>
            </article>

            <article className="highlightCard">
              <h2>임대/비용/시설</h2>
              <div className="kvList">
                <p>
                  <span>임대보증금</span>
                  <strong>{formatCurrency(parsed.lease.deposit)}</strong>
                </p>
                <p>
                  <span>월세</span>
                  <strong>{formatCurrency(parsed.lease.monthlyRent)}</strong>
                </p>
                <p>
                  <span>평당 월세</span>
                  <strong>{formatCurrency(parsed.lease.monthlyRentPerPyeong)}</strong>
                </p>
                <p>
                  <span>등기비용</span>
                  <strong>{formatCurrency(parsed.otherCosts.registration)}</strong>
                </p>
                <p>
                  <span>부동산수수료</span>
                  <strong>{formatCurrency(parsed.otherCosts.brokerage)}</strong>
                </p>
                <p>
                  <span>냉난방/인테리어</span>
                  <strong>
                    {(parsed.facility.hvac || '-') + ' / ' + (parsed.facility.interior || '-')}
                  </strong>
                </p>
                <p>
                  <span>대출이자율</span>
                  <strong>{parsed.loanInterestLabel || '-'}</strong>
                </p>
              </div>
            </article>
          </section>

          <section className="tableSection">
            <div className="tableHeader">
              <h2>대출금액별 수익률 시나리오</h2>
              <p>{parsed.scenarios.length}개 시나리오</p>
            </div>
            <div className="tableContainer">
              <table>
                <thead>
                  <tr>
                    <th>LTV</th>
                    <th>대출금액</th>
                    <th>자기자본</th>
                    <th>보증금</th>
                    <th>고정비</th>
                    <th>총투입자본</th>
                    <th>월세</th>
                    <th>월이자</th>
                    <th>월순현금흐름</th>
                    <th>월수익률</th>
                    <th>연수익</th>
                    <th>연수익률</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.scenarios.map((scenario) => (
                    <tr key={scenario.ltv}>
                      <td>{scenario.ltv}</td>
                      <td>{formatCurrency(scenario.loanAmount)}</td>
                      <td>{formatCurrency(scenario.equity)}</td>
                      <td>{formatCurrency(scenario.deposit)}</td>
                      <td>{formatCurrency(scenario.fixedCost)}</td>
                      <td>{formatCurrency(scenario.investedTotal)}</td>
                      <td>{formatCurrency(scenario.monthlyRent)}</td>
                      <td>{formatCurrency(scenario.monthlyInterest)}</td>
                      <td className={(scenario.monthlyNet ?? 0) < 0 ? 'negativeCell' : ''}>
                        {formatCurrency(scenario.monthlyNet)}
                      </td>
                      <td>{formatPercent(scenario.monthlyRoi)}</td>
                      <td>{formatCurrency(scenario.annualProfit)}</td>
                      <td>{formatPercent(scenario.annualRoi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="tableSection">
            <div className="tableHeader">
              <h2>세금 항목</h2>
              <p>기본 접힘 상태</p>
            </div>
            <details className="disclosureCard">
              <summary>
                <span>세금 상세 보기</span>
                <span>펼치기</span>
              </summary>
              <div className="disclosureBody">
                <p>
                  <span>재산세(건물분)</span>
                  <strong>{formatCurrency(parsed.otherCosts.propertyBuildingTax)}</strong>
                </p>
                <p>
                  <span>재산세(토지분)</span>
                  <strong>{formatCurrency(parsed.otherCosts.propertyLandTax)}</strong>
                </p>
              </div>
            </details>
          </section>
        </>
      ) : null}
    </div>
  )
}
