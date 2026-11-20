/**
 * 한전 개조식(kepco 변형) — 번호 제목 문단·□○ 글꼴·붙임 제목 띠와 목록·다단 결재 표지. 기본(개조식)은 그대로.
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { markdownToHwpx, parse, PRESET_ALIAS, isKepcoPresetAlias } from "../src/index.js"
import { buildGongmunOptions } from "../src/hwpx/gongmun-surface.js"
import { resolveGongmun } from "../src/hwpx/gongmun.js"

const md = `# 분산e 단선 역가압 해소 방안

## 추진배경

### 분산e 연계선로 단선 대응 필요

- 이력 관리 지원
  - 인증은 토큰으로 설정

※ 동작시간은 0.5초~2초

## 현황

### (특성) 단선 시 역가압 발생

- 문제점 : 미개방

## 붙임 1. 현재 대응대책

### (개요) 현행 대책

## 붙임 2. 요약

### (개요) 과제
`
const cover = { org: "배전운영처", dept: "배전계통부", subtitle: "ADMS 기반", author: { rank: "차장", name: "홍길동", phone: "061-0000" } }
const kepco = { preset: "gaejosik" as const, kepco: true, approvalCover: cover }

async function parts(opts: object): Promise<{ sec: string; hdr: string }> {
  const z = await JSZip.loadAsync(await markdownToHwpx(md, { gongmun: opts as never }))
  return { sec: await z.file("Contents/section0.xml")!.async("text"), hdr: await z.file("Contents/header.xml")!.async("text") }
}
const texts = (sec: string) => [...sec.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map((m) => m[1])

describe("한전 개조식", () => {
  it("별칭 — 한전 개조식·한전개조식·kepco 가 개조식 키로 풀리고 변형 판정이 선다", () => {
    for (const k of ["한전 개조식", "한전개조식", "kepco"]) {
      assert.equal(PRESET_ALIAS[k], "gaejosik")
      assert.equal(isKepcoPresetAlias(k), true)
    }
    assert.equal(isKepcoPresetAlias("개조식"), false)
    assert.equal(Object.keys(PRESET_ALIAS)[0], "한전 개조식", "프리셋 목록 맨 앞")
  })

  it("기본(개조식)은 변형 없음 — 장 띠·목차 그대로", async () => {
    const { sec } = await parts({ preset: "gaejosik", cover: false })
    assert.ok(!texts(sec).some((t) => /^1\. 추진배경/.test(t)))
    assert.equal(resolveGongmun({ preset: "gaejosik" }).kepco, false)
    assert.equal(resolveGongmun({ preset: "report", kepco: true }).kepco, false)
  })

  it("장 제목은 띠 없는 '1. 제목', 붙임은 번호를 세지 않는다", async () => {
    const { sec } = await parts(kepco)
    const t = texts(sec)
    assert.ok(t.includes("1. 추진배경"))
    assert.ok(t.includes("2. 현황"))
    assert.ok(!t.some((s) => /^3\. 붙임/.test(s)))
    assert.ok(!t.includes("목  차") && !t.includes("목 차"), "목차 기본 꺼짐")
  })

  it("□ 휴먼명조 16pt · ○ 휴먼명조 15pt · ※ 맑은 고딕 13pt", async () => {
    const { hdr } = await parts(kepco)
    const faces = [...hdr.matchAll(/<hh:fontface lang="HANGUL"[\s\S]*?<\/hh:fontface>/g)][0][0]
    const font = (id: number) => faces.match(new RegExp(`<hh:font id="${id}" face="([^"]*)"`))?.[1] ?? ""
    const cp = (id: number) => hdr.match(new RegExp(`<hh:charPr id="${id}" height="(\\d+)"[\\s\\S]*?<hh:fontRef hangul="(\\d+)"`))!
    // ※ 참고 charPr 13 = 맑은 고딕 13pt
    assert.equal(cp(13)[1], "1300")
    assert.equal(font(Number(cp(13)[2])), "맑은 고딕")
    // levels 가 만든 □·○ 전용 charPr — 휴먼명조 1600·1500
    const all = [...hdr.matchAll(/<hh:charPr id="(\d+)" height="(\d+)"[\s\S]*?<hh:fontRef hangul="(\d+)"/g)].map((m) => [Number(m[2]), font(Number(m[3]))] as const)
    assert.ok(all.some(([h, f]) => h === 1600 && f === "휴먼명조"))
    assert.ok(all.some(([h, f]) => h === 1500 && f === "휴먼명조"))
  })

  it("붙임 — 새 쪽에서 시작하는 회색 제목 띠 + 본문 끝 목록('붙 임 1. …  1부.', 끝.)", async () => {
    const { sec } = await parts(kepco)
    assert.equal((sec.match(/name="__kordoc_attach"/g) ?? []).length, 2)
    assert.equal((sec.match(/pageBreak="1"/g) ?? []).length >= 2, true)
    const t = texts(sec)
    assert.ok(t.includes("붙임 1") && t.includes("붙임 2"))
    // 첫 줄 "붙 임" 뒤는 탭(내어쓰기 자리) — "1." 과 다음 줄 "2." 가 같은 x
    assert.ok(/<hp:t>붙 임<hp:tab [^>]*\/>1\. 현재 대응대책  1부\.<\/hp:t>/.test(sec))
    assert.ok(t.some((s) => s.startsWith("2. 요약") && s.endsWith("1부. 끝.")))
    // 목록은 첫 붙임 제목 띠보다 앞
    assert.ok(sec.indexOf("<hp:t>붙 임<hp:tab") < sec.indexOf("붙임 1</hp:t>"))
  })

  it("들여쓰기 — 1. 0칸 / □ 1칸 / ○ 2칸 / -·* 3칸(1칸 = 16pt), 간격 규칙 기본 켬, 참고 부호는 *", async () => {
    const { sec, hdr } = await parts(kepco)
    const left = (id: number) => Number(hdr.match(new RegExp(`<hh:paraPr id="${id}"[\\s\\S]*?<hc:left value="(-?\\d+)"`))![1])
    const line = (id: number) => Number(hdr.match(new RegExp(`<hh:paraPr id="${id}"[\\s\\S]*?<hh:lineSpacing type="PERCENT" value="(\\d+)"`))![1])
    assert.deepEqual([left(8), left(9), left(10), left(20)], [800, 1600, 2400, 2400])
    assert.equal(line(8), 200)
    assert.ok(/<hp:t>\*<hp:tab/.test(sec), "※ 원고가 * 부호로")
    const off = resolveGongmun({ preset: "gaejosik", kepco: true, stepIndent: false, stepSpacing: false })
    assert.equal(off.stepIndent, false)
    assert.equal(off.stepSpacing, false)
  })

  it("간격 — 문단 위는 모두 5pt, 장 제목 앞은 빈 줄 100%, * 앞 문단 180%, * 220%", async () => {
    const { sec, hdr } = await parts(kepco)
    const pp = (id: number) => {
      const b = hdr.slice(hdr.indexOf(`<hh:paraPr id="${id}"`), hdr.indexOf("</hh:paraPr>", hdr.indexOf(`<hh:paraPr id="${id}"`)))
      return { prev: Number(b.match(/<hc:prev value="(-?\d+)"/)![1]), next: Number(b.match(/<hc:next value="(-?\d+)"/)![1]), ls: Number(b.match(/lineSpacing type="PERCENT" value="(\d+)"/)![1]) }
    }
    assert.deepEqual(pp(23), { prev: 500, next: 0, ls: 200 }, "장 제목: 위 5pt, 아래 0, 200%")
    assert.deepEqual(pp(8), { prev: 500, next: 0, ls: 200 }, "□: 위 5pt")
    assert.deepEqual(pp(9), { prev: 500, next: 0, ls: 200 }, "○: 위 5pt")
    assert.deepEqual(pp(20), { prev: 500, next: 0, ls: 220 }, "*: 위 5pt, 220%")
    // 본문 문단 순서대로 [paraPr, 첫 글자]
    const body = sec.slice(sec.lastIndexOf("<hp:p ", sec.indexOf("1. 추진배경")))
    const seq = [...body.matchAll(/<hp:p (?:pageBreak="1" )?paraPrIDRef="(\d+)"[^>]*><hp:run[^>]*>(?:<hp:ctrl>[\s\S]*?<\/hp:ctrl>)*<hp:t>([^<]{0,6})/g)].map((m) => [Number(m[1]), m[2]] as const)
    const lsOf = (text: string) => pp(seq.find(([, t]) => t.startsWith(text))![0])
    assert.equal(lsOf("1. 추진").ls, 200, "장 제목 바로 아래 첫 □ 는 200% 그대로")
    assert.equal(lsOf("-").ls, 180, "* 앞 - → 180%")
    assert.equal(lsOf("*").ls, 220, "* 는 220% 그대로(앞 문단 줄간격을 바꾸지 않는다)")
    // * 와 다음 장 제목 사이에 빈 줄(줄간격 100%, 문단 위 0)
    const iStar = seq.findIndex(([, t]) => t.startsWith("*"))
    assert.deepEqual(seq[iStar + 1][1], "", "* 다음은 빈 줄")
    assert.deepEqual({ ls: pp(seq[iStar + 1][0]).ls, prev: pp(seq[iStar + 1][0]).prev }, { ls: 100, prev: 0 })
    assert.ok(seq[iStar + 2][1].startsWith("2. 현"), "빈 줄 다음 장 제목")
    for (const [id, t] of seq.slice(0, 6)) if (t) assert.equal(pp(id).prev, 500, "글자 있는 문단 위는 5pt")
  })

  it("두 번째 이후 □ 앞은 빈 줄 50%(위 문장 200% 유지), 장 제목 바로 아래 첫 □ 는 빈 줄 없음", async () => {
    const z = await JSZip.loadAsync(await markdownToHwpx("## 추진배경\n\n### 첫째 항목\n\n- 내용 하나\n\n### 둘째 항목\n\n- 내용 둘\n", { gongmun: kepco as never }))
    const sec = await z.file("Contents/section0.xml")!.async("text")
    const hdr = await z.file("Contents/header.xml")!.async("text")
    const ls = (id: string) => Number(hdr.slice(hdr.indexOf(`<hh:paraPr id="${id}"`)).match(/lineSpacing type="PERCENT" value="(\d+)"/)![1])
    const pOf = (text: string) => sec.slice(sec.lastIndexOf("<hp:p ", sec.indexOf(text))).match(/paraPrIDRef="(\d+)"/)![1]
    assert.equal(ls(pOf("1. 추진배경")), 200, "장 제목 → 첫 □ 200%")
    // 위 문장 "내용 하나"(○) 는 200% 그대로, 그 뒤 빈 줄 50%, 그 뒤 둘째 □
    assert.equal(ls(pOf("내용 하나")), 200, "위 문장은 200% 유지")
    const after = sec.slice(sec.indexOf("내용 하나"), sec.indexOf("둘째 항목"))
    const blanks = [...after.matchAll(/<hp:p paraPrIDRef="(\d+)"[^>]*><hp:run[^>]*><hp:t><\/hp:t>/g)]
    assert.equal(blanks.length, 1, "빈 줄 하나")
    assert.equal(ls(blanks[0][1]), 50)
    // 장 제목과 첫 □ 사이에는 빈 줄이 없다
    const head = sec.slice(sec.indexOf("1. 추진배경"), sec.indexOf("첫째 항목"))
    assert.ok(!/<hp:t><\/hp:t>/.test(head))
  })

  it("□ 문장은 전체 굵게, □ 부호만 보통 굵기 — 괄호는 전용 글자 모양", async () => {
    const { sec, hdr } = await parts(kepco)
    const cp = (id: string) => hdr.slice(hdr.indexOf(`<hh:charPr id="${id}"`), hdr.indexOf("</hh:charPr>", hdr.indexOf(`<hh:charPr id="${id}"`)))
    const m = /<hp:t>\(특성\)<\/hp:t><\/hp:run><hp:run charPrIDRef="(\d+)"><hp:t> <\/hp:t><\/hp:run><hp:run charPrIDRef="(\d+)"><hp:t>단선 시/.exec(sec)
    assert.ok(m, "괄호 뒤 본문 run")
    const b = cp(m![2])
    assert.ok(b.includes('bold="1"') && b.includes('height="1600"'), "□ 문장은 굵게: " + b)
    // 같은 문단의 □ 부호 run 은 굵지 않다
    const para = sec.slice(sec.lastIndexOf("<hp:p ", sec.indexOf("(특성)")), sec.indexOf("(특성)"))
    const mk = /<hp:run charPrIDRef="(\d+)"><hp:t>□/.exec(para)
    assert.ok(mk, "□ 부호 run")
    assert.ok(!cp(mk![1]).includes('bold="1"'), "□ 부호는 보통 굵기: " + cp(mk![1]))
  })

  it("#### 시사점 + 목록 → 시사점 상자, >> 문장 → 결론 띠", async () => {
    const src = "## 현황\n\n### (개요) 내용\n\n#### 시사점\n\n- (VCB 개방) 신규만 확인\n  - 정전 시 민원\n- (책임분계점) 비용 예상\n\n>> 대안 필요\n\n## 다음\n\n### 항목\n"
    const z = await JSZip.loadAsync(await markdownToHwpx(src, { gongmun: kepco as never }))
    const sec = await z.file("Contents/section0.xml")!.async("text")
    const hdr = await z.file("Contents/header.xml")!.async("text")
    assert.ok(sec.includes('name="__kordoc_insight"'))
    assert.ok(/<hp:t> 시 사 점 <\/hp:t>/.test(sec))
    // 목록은 상자 안에만 — ○ 문단으로 따로 나오지 않는다
    assert.equal((sec.match(/신규만 확인/g) ?? []).length, 1)
    assert.ok(/<hp:t>•<hp:tab[^>]*\/><\/hp:t><\/hp:run><hp:run charPrIDRef="\d+"><hp:t>\(VCB 개방\)<\/hp:t>/.test(sec))
    assert.ok(sec.includes("정전 시 민원"))
    assert.ok(sec.includes('name="__kordoc_conclusion"') && sec.includes("<hp:t>대안 필요</hp:t>"))
    assert.ok(!sec.includes("&gt;&gt;"), "결론 표지 >> 는 남지 않는다")
    assert.ok(hdr.includes('textColor="#3A3C84"') && hdr.includes('textColor="#3057B9"'))
    // 일반 개조식에서는 그대로(○ 제목 + 목록)
    const plain = await (await JSZip.loadAsync(await markdownToHwpx(src, { gongmun: { preset: "gaejosik", cover: false } }))).file("Contents/section0.xml")!.async("text")
    assert.ok(!plain.includes("__kordoc_insight"))
  })

  it("표 — 글자처럼 취급 + 오른쪽 정렬, 한 쪽을 넘는 표는 경고", async () => {
    const { sec } = await parts({ ...kepco, approvalCover: undefined })
    assert.ok(!sec.includes('treatAsChar="0"'))
    const rows = Array.from({ length: 40 }, (_, i) => `| ${i} | 긴 내용 ${i} |`).join("\n")
    const warnings: string[] = []
    await markdownToHwpx(`## 현황\n\n| 구분 | 내용 |\n|---|---|\n${rows}\n`, { gongmun: kepco as never, warnings })
    assert.ok(warnings.some((w) => w.includes("한 쪽 본문 높이를 넘습니다")), warnings.join("\n"))
  })

  it("□ 첫 괄호 — 한컴 윤고딕 740 굵게 #203A7B, □ 크기, 괄호 없는 □ 는 그대로", async () => {
    const { sec, hdr } = await parts(kepco)
    const m = /<hp:run charPrIDRef="(\d+)"><hp:t>\(특성\)<\/hp:t><\/hp:run>/.exec(sec)
    assert.ok(m, "괄호만 따로 run")
    const b = hdr.slice(hdr.indexOf(`<hh:charPr id="${m![1]}"`), hdr.indexOf("</hh:charPr>", hdr.indexOf(`<hh:charPr id="${m![1]}"`)))
    assert.ok(b.includes('height="1600"') && b.includes('textColor="#203A7B"') && b.includes('bold="1"'), b)
    assert.ok(hdr.includes('face="한컴 윤고딕 740"'))
    assert.ok(!/<hp:t>분산e 연계선로 단선 대응 필요<\/hp:t><\/hp:run><hp:run[^>]*><hp:t> <\/hp:t>/.test(sec))
  })

  it("쪽 번호 — 본문 첫 쪽부터 1, 붙임 쪽은 없음", async () => {
    const { sec } = await parts(kepco)
    assert.ok(sec.includes('<hp:newNum num="1" numType="PAGE"/>'))
    const att = sec.slice(sec.indexOf("붙임 1</hp:t>") - 4000, sec.indexOf("붙임 1</hp:t>"))
    assert.ok(att.includes('<hp:pageNum pos="NONE"'), "첫 붙임에서 쪽 번호 없음")
    assert.equal((sec.match(/hidePageNum="1"/g) ?? []).length >= 3, true, "표지 + 붙임 2쪽 감추기")
  })

  it("표 — 회색 0.12mm 선, 양옆 열린 표, 머리 행 #F2F2F2", async () => {
    const z = await JSZip.loadAsync(await markdownToHwpx("## 현황\n\n| 구분 | 내용 |\n|---|---|\n| 기준 | 재정립 |\n", { gongmun: kepco as never }))
    const hdr = await z.file("Contents/header.xml")!.async("text")
    const sec = await z.file("Contents/section0.xml")!.async("text")
    // 첫 열 칸: 왼쪽 선 없음 + 오른쪽 회색 0.12mm
    const firstCellBf = sec.match(/<hp:tc [^>]*borderFillIDRef="(\d+)"[^>]*>(?:(?!<\/hp:tc>)[\s\S])*?<hp:cellAddr colAddr="0" rowAddr="1"/)![1]
    const bf = hdr.slice(hdr.indexOf(`<hh:borderFill id="${firstCellBf}"`), hdr.indexOf("</hh:borderFill>", hdr.indexOf(`<hh:borderFill id="${firstCellBf}"`)))
    assert.ok(/<hh:leftBorder type="NONE"/.test(bf), bf)
    assert.ok(/<hh:rightBorder type="SOLID" width="0.12 mm" color="#808080"/.test(bf), bf)
    assert.ok(hdr.includes('faceColor="#F2F2F2"'))
  })

  it("다단 결재 표지 — 결재표(기본 차장·부장·처장)·합의·문서번호 상자·제목 '( 안 )'·처·부·작성자", async () => {
    const { sec } = await parts(kepco)
    const t = texts(sec)
    for (const s of ["차장", "부장", "처장", "합의", "문서번호", "등 록 일", "보존기간", "공개구분", "공개", "ADMS 기반", "분산e 단선 역가압 해소 방안 ( 안 )", "배전운영처", "배전계통부"]) {
      assert.ok(t.includes(s), `표지에 ${s}`)
    }
    assert.ok(t.includes("작성자 : 배전계통부 차장 홍길동 (☎ 061-0000)"))
  })

  it("결재 직위·합의 지정과 합의 줄 제거", async () => {
    const a = await parts({ ...kepco, approvalCover: { ...cover, signers: ["과장", "부장"], agree: "계통운영부" } })
    const t = texts(a.sec)
    assert.ok(t.includes("과장") && t.includes("계통운영부") && !t.includes("처장"))
    const b = await parts({ ...kepco, approvalCover: { ...cover, agree: false } })
    assert.ok(!texts(b.sec).includes("합의"))
  })

  it("왕복 — 파서가 읽고, step 옵션과도 함께 동작", async () => {
    const buf = await markdownToHwpx(md, { gongmun: { ...kepco, stepIndent: true, stepSpacing: true } as never })
    const back = await parse(buf)
    assert.ok(back.success)
    assert.ok((back.markdown ?? "").includes("추진배경"))
  })

  it("CLI·MCP 공용 조립이 kepco·approvalCover 를 전달", () => {
    const o = buildGongmunOptions({ preset: "gaejosik", kepco: true, approvalCover: cover })
    assert.equal(o.kepco, true)
    assert.deepEqual(o.approvalCover, cover)
    assert.ok(!("kepco" in buildGongmunOptions({ preset: "gaejosik" })))
  })
})
