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
  pageHidingCtrl, GJ_CHAR_CHAPTER_TITLE, GJ_CHAR_TOC_ITEM, GJ_CHAR_COVER_SUB, GJ_CHAR_TABLE, GJ_PARA_CHAPTER,
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
 * 순서: 절 띠(stepIndent·stepSpacing) → 붙임 목록 첫 줄·다음 줄 → 붙임 제목 띠 호스트(다음이 □ / 그 밖)(kepco)
 */
export function gaejosikExtraParaIds(g: Pick<ResolvedGongmun, "stepIndent" | "stepSpacing" | "kepco">, variantCount: number, variantBase: number): { sectionBand?: number; attach?: KepcoAttachParaIds } {
  let next = variantBase + variantCount
  const sectionBand = g.stepIndent || g.stepSpacing ? next++ : undefined
  let attach: KepcoAttachParaIds | undefined
  if (g.kepco) {
    const first = next++, nxt = next++, hostDae = next++, hostOther = next++
    const twins: Record<number, Record<number, number>> = {}
    for (const pct of KEPCO_TWIN_SPACINGS) {
      twins[pct] = {}
      for (const b of KEPCO_TWIN_BASES) twins[pct][b] = next++
    }
    attach = { first, next: nxt, hostDae, hostOther, twins }
  }
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

/**
 * `붙임 N | 제목` 회색 띠 — 새 쪽에서 시작한다. 붙임 쪽에는 쪽 번호를 달지 않는다:
 * 첫 붙임에 쪽 번호 위치 "없음" 컨트롤(그 쪽부터 끝까지)을, 붙임마다 그 쪽 번호 감추기를 넣는다.
 * @param hostPara 띠 호스트 paraPr — 아래 간격으로 띠와 첫 본문 사이를 300%에 맞춘다
 */
export function buildKepcoAttachTitle(no: string, title: string, bodyWidth: number, bfReg: TableBfRegistry, hostPara: number = PARA_NORMAL, first = false): string {
  const bf = bfReg.get({ t: ["0.7 mm", "#808080"], b: ["0.7 mm", "#808080"], l: "none", r: "none", fill: "#F2F2F2" })
  const cellPara = (text: string) =>
    `<hp:p paraPrIDRef="${GONGMUN_CENTER}" styleIDRef="0"><hp:run charPrIDRef="${GJ_CHAR_TOC_ITEM}"><hp:t>${escapeTextXml(text)}</hp:t></hp:run></hp:p>`
  const titleW = bodyWidth - ATTACH_NUM_W
  const row = tc({ bf, row: 0, col: 0, w: ATTACH_NUM_W, h: ATTACH_ROW_H, paras: cellPara(`붙임 ${no}`) })
    + tc({ bf, row: 0, col: 1, w: titleW, h: ATTACH_ROW_H, paras: cellPara(title), name: "__kordoc_attach" })
  const table = tbl([row], bodyWidth, ATTACH_ROW_H, 2).replace(`<hp:outMargin left="283" right="283" top="283" bottom="283"/>`, `<hp:outMargin left="0" right="0" top="283" bottom="0"/>`)
  const ctrls = (first ? `<hp:ctrl><hp:pageNum pos="NONE" formatType="DIGIT" sideChar="-"/></hp:ctrl>` : "") + pageHidingCtrl(false)
  return `<hp:p paraPrIDRef="${hostPara}" styleIDRef="0" pageBreak="1"><hp:run charPrIDRef="${CHAR_NORMAL}">${ctrls}${table}</hp:run></hp:p>`
}

// ─── 붙임 목록 ──────────────────────────────────────

/** 목록 문단 paraPr 둘(첫 줄·다음 줄) — gen-header 가 변형 paraPr 뒤에 붙이고 gen-section 이 같은 식으로 id 를 찾는다 */
export interface KepcoAttachParaIds {
  first: number; next: number; hostDae: number; hostOther: number
  /** 줄간격 짝 paraPr — twins[줄간격][원래 paraPr id] = 짝 id. 다음 문단에 따라 앞 문단 줄간격만 바꾼다 */
  twins: Record<number, Record<number, number>>
}

/**
 * 줄간격 짝을 만드는 원래 paraPr — 본문 0·□○-ㆍ(8~11)·가운데(16)·오른쪽(표 호스트·출처 17)·*(20)·장 제목(23)·긴 출처(34).
 * 한글은 줄간격이 그 줄과 다음 줄 사이를 정하므로 "앞 문단 → 다음 문단" 간격은 앞 문단 줄간격으로 낸다.
 */
export const KEPCO_TWIN_BASES = [0, 8, 9, 10, 11, 16, 17, 20, 23, 34]
/** 짝 줄간격 — * 앞 180%, □ 앞 250%, 장 제목 앞 300%(사용자 지정 2026-11-19) */
export const KEPCO_TWIN_SPACINGS = [180, 250, 300]
/** 다음 문단 첫 paraPr → 앞 문단이 가질 줄간격 */
export function kepcoSpacingBefore(nextParaPr: number): number | undefined {
  return nextParaPr === 20 ? 180 : nextParaPr === 8 ? 250 : nextParaPr === 23 ? 300 : undefined
}

/** 한전 개조식 문단 위 간격 — 모든 본문 문단 5pt(레퍼런스 □·○ 문단 위 500) */
export const KEPCO_PARA_BEFORE = 500
/** * 참고 문단 줄간격 — * 와 아래 문단 사이 220%(사용자 지정) */
export const KEPCO_REF_LINE_SPACING = 220
/** □ 문장 첫 괄호 "(분산e 특성)" 글꼴·색 — 레퍼런스 한컴 윤고딕 740 굵게 #203A7B(크기는 □ 본문과 같게, 사용자 지정) */
export const KEPCO_PAREN_FONT = "한컴 윤고딕 740"
export const KEPCO_PAREN_COLOR = "#203A7B"
/** □ 문장 첫 괄호 — [괄호, 나머지] */
export function splitLeadParen(text: string): [string, string] | null {
  const m = /^(\([^()]{1,30}\))\s*([\s\S]*)$/.exec(text.trim())
  return m ? [m[1], m[2]] : null
}

/**
 * `붙 임 1. 제목  1부.` 목록. 첫 줄만 "붙 임" 머리를 달고 나머지는 번호 자리를 맞춘다.
 * @param hang "붙 임 " 머리 폭(HWPUNIT) — paraPr 내어쓰기와 같은 값
 */
export function buildKepcoAttachList(items: { no: string; title: string }[], ids: KepcoAttachParaIds): string[] {
  return items.map((it, i) => {
    const end = i === items.length - 1 ? " 끝." : ""
    const text = escapeTextXml(`${i + 1}. ${it.title}  1부.${end}`)
    // 첫 줄은 "붙 임" 뒤 탭이 내어쓰기 자리(= 다음 줄 왼쪽)로 가서 "1." 과 "2." 가 같은 x 에 선다
    const head = i === 0 ? `붙 임<hp:tab width="750" leader="0" type="1"/>` : ""
    return `<hp:p paraPrIDRef="${i === 0 ? ids.first : ids.next}" styleIDRef="0"><hp:run charPrIDRef="${CHAR_NORMAL}"><hp:t>${head}${text}</hp:t></hp:run></hp:p>`
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
