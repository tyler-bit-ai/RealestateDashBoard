type UnitDetailRoute = {
  slug: string
  gid: string
  title: string
  aliases: string[]
}

const UNIT_DETAIL_ROUTES: UnitDetailRoute[] = [
  {
    slug: 'deogeun-riverwalk-b-1016',
    gid: '85403937',
    title: '덕은 리버워크 B동 1016호',
    aliases: ['덕은 리버워크 B동 1016호'],
  },
  {
    slug: 'ace-gwanggyo-b307',
    gid: '103325700',
    title: '에이스광교타워2차 B307호',
    aliases: ['에이스광교타워2차 B307호'],
  },
  {
    slug: 'ace-gwanggyo-b308',
    gid: '833618035',
    title: '에이스광교타워2차 B308호',
    aliases: ['에이스광교타워2차 B308호'],
  },
  {
    slug: 'incheon-u1-c1119',
    gid: '193221968',
    title: '인천유원 C1119호',
    aliases: ['인천유원 C1119호', '인천테크노밸리 U1센터 C동 1119호'],
  },
  {
    slug: 'sanghyeon-signature-b318',
    gid: '512239277',
    title: '상현 시그니처 광교 B318호',
    aliases: ['상현 시그니처 광교 B318호'],
  },
  {
    slug: 'deogeun-gl-aa509',
    gid: '323618908',
    title: '덕은지엘매트로시티 AA509호',
    aliases: ['덕은지엘매트로시티 AA509호', 'GL메트로시티 한강 AA-509호'],
  },
  {
    slug: 'deogeun-gl-ab1005',
    gid: '827101596',
    title: '덕은지엘매트로시티 AB1005호',
    aliases: ['덕은지엘매트로시티 AB1005호', 'GL메트로시티 한강 AB-1005호'],
  },
  {
    slug: 'mullae-skv1-712',
    gid: '1376039638',
    title: '문래 SKv1 712호',
    aliases: ['문래 SKv1 712호', '문래SKv1 712호'],
  },
  {
    slug: 'seonyudo-twentyfirst-b109',
    gid: '1444037565',
    title: '선유도투웨니퍼스트밸리 B109호',
    aliases: ['선유도투웨니퍼스트밸리 B109호', '선유도 투웨니퍼스트 밸리 B109호'],
  },
]

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, '')
}

export function getUnitDetailBySite(site: string) {
  const target = normalize(site)
  return (
    UNIT_DETAIL_ROUTES.find((route) =>
      route.aliases.some((alias) => normalize(alias) === target),
    ) ?? null
  )
}

export function getUnitDetailBySlug(slug: string) {
  return UNIT_DETAIL_ROUTES.find((item) => item.slug === slug) ?? null
}
