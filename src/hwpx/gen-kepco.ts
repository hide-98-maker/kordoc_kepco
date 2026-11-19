/**
 * 한전 개조식(preset 'kepco') 전용 XML 조립 — 번호 제목 문단·붙임 제목 띠·붙임 목록·다단 결재 표지.
 *
 * 근거: 한전 계획보고 레퍼런스(「분산e 일괄 자동개방투입 체계 구축 방안」)와 결재표지 레퍼런스를 디코드해 잰 값.
 *   - 장 제목 "1. 추진배경": 띠 없는 문단, HY헤드라인M 17pt (개조식 장 제목 칸 글꼴·크기와 같다)
 *   - 붙임 제목: 1×2 표 [붙임 N][제목] — 위아래 0.7mm #808080 선·#F2F2F2 채움·양옆 선 없음, HY헤드라인M 18pt, 가운데 정렬,
 *     폭 7535 + 나머지, 높이 3782. 본문 끝에 "붙 임 1. … 1부." 목록, 마지막 줄 끝에 "끝."
 *   - 결재표지: 우측 위 결재표(직위 줄 + 서명 칸), 그 아래 합의 줄, 좌측 문서번호 상자(문서번호·등록일·보존기간·공개구분),
 *     왼쪽 부제 + 제목 "( 안 )", 가운데 처·부 이름, 작성자 줄
 * 이 모듈은 문자열 조립만 한다 — 옵션 해석은 gongmun.ts, id 배선은 gen-section.ts·gen-header.ts.
 */

import { type ResolvedGongmun } from "./gongmun.js"
import { tbl, tc } from "./gen-gongmun-extra.js"
import type { TableBfRegistry } from "./gen-table-bf.js"
import {
  PARA_NORMAL, CHAR_NORMAL, GONGMUN_CENTER, GONGMUN_RIGHT,
  GJ_CHAR_CHAPTER_TITLE, GJ_CHAR_TOC_ITEM, GJ_CHAR_COVER_SUB, GJ_CHAR_TABLE, GJ_PARA_CHAPTER,
  escapeTextXml,
} from "./gen-ids.js"

// ─── 붙임 판정 ──────────────────────────────────────

/** `붙임 1. 제목`·`붙임 3-1 제목` 형태의 장 제목 — [번호, 제목] */
const ATTACH_RE = /^붙\s*임\s*(\d+(?:-\d+)?)\s*[.．)]?\s*(.+)$/

export function parseAttachHeading(text: string): { no: string; title: string } | null {
  const m = ATTACH_RE.exec(text.trim())
  return m ? { no: m[1], title: m[2].trim() } : null
}

// ─── 변형 paraPr id ─────────────────────────────────

/**
 * 변형 paraPr(두 자리 부호 내어쓰기) 뒤에 붙는 개조식 전용 paraPr 의 id — gen-header 가 방출하고 gen-section 이 같은 식으로 조회한다.
 * 순서: 절 띠(stepIndent·stepSpacing) → 붙임 목록 첫 줄 → 붙임 목록 다음 줄(kepco)
 */
export function gaejosikExtraParaIds(g: Pick<ResolvedGongmun, "stepIndent" | "stepSpacing" | "kepco">, variantCount: number, variantBase: number): { sectionBand?: number; attach?: KepcoAttachParaIds } {
  let next = variantBase + variantCount
  const sectionBand = g.stepIndent || g.stepSpacing ? next++ : undefined
  const attach = g.kepco ? { first: next++, next: next++ } : undefined
  return { sectionBand, attach }
}

// ─── 번호 제목 문단 ─────────────────────────────────

/** `1. 추진배경` — 띠 없는 HY헤드라인M 17pt 문단. 호스트는 장 헤더와 같은 paraPr(다음 문단과 같은 쪽·앞 간격) */
export function buildKepcoHeading(no: number, title: string): string {
  return `<hp:p paraPrIDRef="${GJ_PARA_CHAPTER}" styleIDRef="0"><hp:run charPrIDRef="${GJ_CHAR_CHAPTER_TITLE}"><hp:t>${no}. ${escapeTextXml(title)}</hp:t></hp:run></hp:p>`
}

// ─── 붙임 제목 띠 ───────────────────────────────────

const ATTACH_NUM_W = 7535
const ATTACH_ROW_H = 3782

/** `붙임 N | 제목` 회색 띠 — 새 쪽에서 시작한다 */
export function buildKepcoAttachTitle(no: string, title: string, bodyWidth: number, bfReg: TableBfRegistry): string {
  const bf = bfReg.get({ t: ["0.7 mm", "#808080"], b: ["0.7 mm", "#808080"], l: "none", r: "none", fill: "#F2F2F2" })
  const cellPara = (text: string) =>
    `<hp:p paraPrIDRef="${GONGMUN_CENTER}" styleIDRef="0"><hp:run charPrIDRef="${GJ_CHAR_TOC_ITEM}"><hp:t>${escapeTextXml(text)}</hp:t></hp:run></hp:p>`
  const titleW = bodyWidth - ATTACH_NUM_W
  const row = tc({ bf, row: 0, col: 0, w: ATTACH_NUM_W, h: ATTACH_ROW_H, paras: cellPara(`붙임 ${no}`) })
    + tc({ bf, row: 0, col: 1, w: titleW, h: ATTACH_ROW_H, paras: cellPara(title), name: "__kordoc_attach" })
  const table = tbl([row], bodyWidth, ATTACH_ROW_H, 2).replace(`<hp:outMargin left="283" right="283" top="283" bottom="283"/>`, `<hp:outMargin left="0" right="0" top="283" bottom="0"/>`)
  return `<hp:p paraPrIDRef="${PARA_NORMAL}" styleIDRef="0" pageBreak="1"><hp:run charPrIDRef="${CHAR_NORMAL}">${table}</hp:run></hp:p>`
}

// ─── 붙임 목록 ──────────────────────────────────────

/** 목록 문단 paraPr 둘(첫 줄·다음 줄) — gen-header 가 변형 paraPr 뒤에 붙이고 gen-section 이 같은 식으로 id 를 찾는다 */
export interface KepcoAttachParaIds { first: number; next: number }

/**
 * `붙 임 1. 제목  1부.` 목록. 첫 줄만 "붙 임" 머리를 달고 나머지는 번호 자리를 맞춘다.
 * @param hang "붙 임 " 머리 폭(HWPUNIT) — paraPr 내어쓰기와 같은 값
 */
export function buildKepcoAttachList(items: { no: string; title: string }[], ids: KepcoAttachParaIds): string[] {
  return items.map((it, i) => {
    const head = i === 0 ? "붙 임 " : ""
    const end = i === items.length - 1 ? " 끝." : ""
    const text = `${head}${i + 1}. ${it.title}  1부.${end}`
    return `<hp:p paraPrIDRef="${i === 0 ? ids.first : ids.next}" styleIDRef="0"><hp:run charPrIDRef="${CHAR_NORMAL}"><hp:t>${escapeTextXml(text)}</hp:t></hp:run></hp:p>`
  })
}

// ─── 결재 표지 ──────────────────────────────────────

/** 결재표지 입력 — 전부 선택(비우면 빈칸). signers 기본은 차장·부장·처장 */
export interface ApprovalCoverOptions {
  /** 결재란 직위(왼쪽부터). 기본 ["차장", "부장", "처장"] */
  signers?: string[]
  /** 합의 줄의 합의 부서·직위. 미지정=빈 칸 줄 유지, false=합의 줄 없음 */
  agree?: string | false
  /** 부제(제목 위 작은 줄) */
  subtitle?: string
  /** 제목 끝에 "( 안 )" 을 붙인다(기본 true) */
  draft?: boolean
  /** 처(실) 이름 — 표지 가운데 큰 줄 */
  org?: string
  /** 부(팀) 이름 — 처 아래 줄 */
  dept?: string
  /** 작성자 — 소속은 dept 를 따른다. 기본 직위 "차장" */
  author?: { dept?: string; rank?: string; name?: string; phone?: string }
  /** 문서번호 상자 값(모두 선택). 공개구분 기본 "공개" */
  docInfo?: { docNo?: string; regDate?: string; retention?: string; openness?: string }
}

export const DEFAULT_SIGNERS = ["차장", "부장", "처장"]

const COL_W = 6900
const SIGN_LABEL_H = 2131
const SIGN_BODY_H = 8000
const AGREE_H = 2600
const DOC_LABEL_W = 6500
const DOC_VALUE_W = 16700
const DOC_ROW_H = 2140

function blankLines(n: number, charPrId: number = GJ_CHAR_COVER_SUB): string[] {
  const p = `<hp:p paraPrIDRef="${PARA_NORMAL}" styleIDRef="0"><hp:run charPrIDRef="${charPrId}"><hp:t></hp:t></hp:run></hp:p>`
  return Array.from({ length: n }, () => p)
}

function textPara(text: string, paraPrId: number, charPrId: number): string {
  return `<hp:p paraPrIDRef="${paraPrId}" styleIDRef="0"><hp:run charPrIDRef="${charPrId}"><hp:t>${escapeTextXml(text)}</hp:t></hp:run></hp:p>`
}

/** 우측 정렬 호스트 안에 표 하나 */
function rightHost(table: string): string {
  return `<hp:p paraPrIDRef="${GONGMUN_RIGHT}" styleIDRef="0"><hp:run charPrIDRef="${CHAR_NORMAL}">${table}</hp:run></hp:p>`
}

export function buildKepcoApprovalCover(title: string, g: ResolvedGongmun, bfReg: TableBfRegistry): string[] {
  const c = g.approvalCover!
  const out: string[] = []
  const thick = (): ["0.4 mm", "#000000"] => ["0.4 mm", "#000000"]
  const cellText = (text: string, charPr: number = GJ_CHAR_TABLE, paraPr: number = GONGMUN_CENTER) =>
    text ? textPara(text, paraPr, charPr) : `<hp:p paraPrIDRef="${paraPr}" styleIDRef="0"><hp:run charPrIDRef="${charPr}"><hp:t></hp:t></hp:run></hp:p>`

  // 1. 결재표 — 직위 줄 + 서명 칸
  const n = c.signers.length
  const signW = COL_W * n
  const signBf = (col: number, row: number) => bfReg.get({
    t: row === 0 ? thick() : "thin", b: row === 1 ? thick() : "thin",
    l: col === 0 ? thick() : "thin", r: col === n - 1 ? thick() : "thin",
  })
  const labelRow = c.signers.map((s, i) => tc({ bf: signBf(i, 0), row: 0, col: i, w: COL_W, h: SIGN_LABEL_H, paras: cellText(s) })).join("")
  const bodyRow = c.signers.map((_, i) => tc({ bf: signBf(i, 1), row: 1, col: i, w: COL_W, h: SIGN_BODY_H, paras: cellText("") })).join("")
  out.push(rightHost(tbl([labelRow, bodyRow], signW, SIGN_LABEL_H + SIGN_BODY_H, n)))

  // 2. 합의 줄
  if (c.agree !== false) {
    const lw = Math.round(signW * 0.2)
    const bf = (col: number) => bfReg.get({ t: thick(), b: thick(), l: col === 0 ? thick() : "thin", r: col === 1 ? thick() : "thin" })
    const row = tc({ bf: bf(0), row: 0, col: 0, w: lw, h: AGREE_H, paras: cellText("합의") })
      + tc({ bf: bf(1), row: 0, col: 1, w: signW - lw, h: AGREE_H, paras: cellText(c.agree ?? "") })
    out.push(rightHost(tbl([row], signW, AGREE_H, 2)))
  }

  // 3. 문서번호 상자 — 왼쪽, 결재표 아래
  const info = c.docInfo
  const docRows: [string, string][] = [
    ["문서번호", info.docNo ?? ""], ["등 록 일", info.regDate ?? ""], ["보존기간", info.retention ?? ""], ["공개구분", info.openness ?? "공개"],
  ]
  const rows = docRows.map(([label, value], r) => {
    const bf = (col: number) => bfReg.get({
      t: r === 0 ? thick() : "thin", b: r === docRows.length - 1 ? thick() : "thin",
      l: col === 0 ? thick() : "thin", r: col === 1 ? thick() : "thin",
    })
    return tc({ bf: bf(0), row: r, col: 0, w: DOC_LABEL_W, h: DOC_ROW_H, paras: cellText(label) })
      + tc({ bf: bf(1), row: r, col: 1, w: DOC_VALUE_W, h: DOC_ROW_H, paras: cellText(value) })
  })
  out.push(`<hp:p paraPrIDRef="${PARA_NORMAL}" styleIDRef="0"><hp:run charPrIDRef="${CHAR_NORMAL}">${tbl(rows, DOC_LABEL_W + DOC_VALUE_W, DOC_ROW_H * docRows.length, 2)}</hp:run></hp:p>`)

  // 4. 부제 + 제목
  out.push(...blankLines(1))
  if (c.subtitle) out.push(textPara(c.subtitle, PARA_NORMAL, GJ_CHAR_TOC_ITEM))
  out.push(textPara(c.draft === false ? title : `${title} ( 안 )`, PARA_NORMAL, GJ_CHAR_COVER_SUB))

  // 5. 처·부 + 작성자
  out.push(...blankLines(4))
  if (c.org) out.push(textPara(c.org, GONGMUN_CENTER, GJ_CHAR_COVER_SUB))
  if (c.dept) out.push(textPara(c.dept, GONGMUN_CENTER, GJ_CHAR_TOC_ITEM))
  const a = c.author
  const who = [a.dept, a.rank, a.name].filter(Boolean).join(" ")
  if (who) out.push(...blankLines(1, CHAR_NORMAL), textPara(`작성자 : ${who}${a.phone ? ` (☎ ${a.phone})` : ""}`, GONGMUN_CENTER, CHAR_NORMAL))
  return out
}
