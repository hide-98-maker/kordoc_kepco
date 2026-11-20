/**
 * 개조식 단계별 계단 들여쓰기(stepIndent)·간격(stepSpacing) — 기본은 종전 그대로, 켜면 단계마다 1칸(5mm)씩 들어가고 간격이 정해진 값을 따른다.
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { markdownToHwpx, parse } from "../src/index.js"
import { buildGongmunOptions } from "../src/hwpx/gongmun-surface.js"
import { resolveGongmun } from "../src/hwpx/gongmun.js"

const UNIT = 800
const md = `# 시험\n\n## 장\n\n### 1. 절\n\n### 대항목 가\n\n- 중항목 가-1\n  - 소항목 가-1-a\n\n### 대항목 나\n\n- 중항목 나-1\n\n<right>출처: 자체</right>`
const base = { preset: "gaejosik" as const, cover: false, toc: false }

/** header.xml paraPr id → { left, line, prev } */
async function paraPrs(buf: ArrayBuffer): Promise<Map<number, { left: number; line: number; prev: number }>> {
  const hdr = await (await JSZip.loadAsync(buf)).file("Contents/header.xml")!.async("text")
  const out = new Map<number, { left: number; line: number; prev: number }>()
  for (const m of hdr.matchAll(/<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g)) {
    const t = m[0]
    out.set(Number(m[1]), {
      left: Number(t.match(/<hc:left value="(-?\d+)"/)?.[1] ?? 0),
      line: Number(t.match(/<hh:lineSpacing type="PERCENT" value="(\d+)"/)?.[1] ?? 0),
      prev: Number(t.match(/<hc:prev value="(-?\d+)"/)?.[1] ?? 0),
    })
  }
  return out
}

describe("개조식 단계별 들여쓰기·간격 (stepIndent·stepSpacing)", () => {
  it("기본은 꺼짐 — □ 0 / ○ 1자 / - 1.5자, 줄간격 본문값", async () => {
    const p = await paraPrs(await markdownToHwpx(md, { gongmun: base }))
    assert.equal(p.get(8)!.left, 0)
    assert.equal(p.get(9)!.left, 1500)
    assert.equal(p.get(10)!.left, 2250)
    assert.equal(p.get(9)!.line, 160)
  })

  it("stepIndent — □ 2칸 / ○ 3칸 / - 4칸", async () => {
    const p = await paraPrs(await markdownToHwpx(md, { gongmun: { ...base, stepIndent: true } }))
    assert.equal(p.get(8)!.left, 2 * UNIT)
    assert.equal(p.get(9)!.left, 3 * UNIT)
    assert.equal(p.get(10)!.left, 4 * UNIT)
    assert.equal(p.get(20)!.left, 4 * UNIT, "※ 참고는 - 와 같은 자리")
  })

  it("stepIndent — 절 띠는 1칸 들이고 표 폭을 1칸 줄여 오른쪽 끝 유지, 장 띠는 0칸", async () => {
    const buf = await markdownToHwpx(md, { gongmun: { ...base, stepIndent: true } })
    const off = await markdownToHwpx(md, { gongmun: base })
    const p = await paraPrs(buf)
    const sec = await (await JSZip.loadAsync(buf)).file("Contents/section0.xml")!.async("text")
    const secOff = await (await JSZip.loadAsync(off)).file("Contents/section0.xml")!.async("text")
    const band = (s: string) => {
      const i = s.indexOf("__kordoc_h3n")
      const head = s.slice(0, i)
      const tbl = head.slice(head.lastIndexOf("<hp:tbl "))
      const host = head.slice(0, head.lastIndexOf("<hp:tbl ")).match(/paraPrIDRef="(\d+)"[^>]*><hp:run[^>]*>$/)![1]
      return { w: Number(tbl.match(/<hp:sz width="(\d+)"/)![1]), host: Number(host) }
    }
    const on = band(sec), prev = band(secOff)
    assert.equal(p.get(on.host)!.left, UNIT)
    assert.equal(prev.w - on.w, UNIT)
    assert.equal(p.get(23)!.left, 0, "장 띠 호스트(23)는 0칸 그대로")
    assert.notEqual(on.host, prev.host)
  })

  it("stepSpacing — 모든 문단 위 5pt, 줄간격은 □ 250%·○- 200%, 띠는 5pt + 몫", async () => {
    const p = await paraPrs(await markdownToHwpx(md, { gongmun: { ...base, stepSpacing: true } }))
    assert.equal(p.get(8)!.line, 250)
    for (const id of [9, 10]) assert.equal(p.get(id)!.line, 200, `paraPr ${id}`)
    for (const id of [8, 9, 10]) assert.equal(p.get(id)!.prev, 500, `paraPr ${id} 문단 위 5pt`)
    assert.equal(p.get(23)!.prev, 2000)
    assert.equal(p.get(20)!.prev, 2340, "※ 위 180%")
    assert.equal(p.get(20)!.line, 200)
  })

  it("※ 참고 글꼴은 맑은 고딕 기본, fonts.ref 로 덮어쓴다", () => {
    assert.equal(resolveGongmun({ preset: "gaejosik", stepIndent: true }).fonts.ref, "맑은 고딕")
    assert.equal(resolveGongmun({ preset: "gaejosik", stepSpacing: true, fonts: { ref: "함초롬돋움" } }).fonts.ref, "함초롬돋움")
    assert.equal(resolveGongmun({ preset: "gaejosik" }).fonts.ref, undefined)
  })

  it("왕복 — 켜도 파서가 위계를 복원", async () => {
    const back = await parse(await markdownToHwpx(md, { gongmun: { ...base, stepIndent: true, stepSpacing: true } }))
    assert.ok(back.success)
    assert.ok(back.blocks.some(b => b.type === "heading" && b.level === 2 && b.text === "장"))
    assert.ok((back.markdown ?? "").includes("중항목 가-1"))
  })

  it("개조식이 아니면 무시(false 고정)", () => {
    const r = resolveGongmun({ preset: "report", stepIndent: true, stepSpacing: true })
    assert.equal(r.stepIndent, false)
    assert.equal(r.stepSpacing, false)
  })

  it("CLI·MCP 공용 조립(buildGongmunOptions)이 전달", () => {
    const o = buildGongmunOptions({ preset: "gaejosik", stepIndent: true, stepSpacing: true })
    assert.equal(o.stepIndent, true)
    assert.equal(o.stepSpacing, true)
    assert.ok(!("stepIndent" in buildGongmunOptions({ preset: "gaejosik" })))
  })
})
