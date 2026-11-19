// 가상 시계를 한 프레임씩 진행하며 스테이지를 찍는다 (README GIF용).
// 페이지의 타이머·RAF가 가상 시계에 묶여 있으므로 대기는 Node에서, 캡처는 CDP로 한다.
import { writeFileSync } from 'node:fs'
import { launch } from './scripts/browser.mjs' // stageshow 폴더 기준
const [url, outDir, fps = '25', seconds = '16.5'] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await launch()
const page = await browser.newPage({ viewport: { width: 860, height: 520 }, deviceScaleFactor: 2 })
await page.goto(url)
for (let i = 0; i < 100; i++) {
  if (await page.evaluate(() => !!(window.__stageshow?.clock && document.querySelector('#example .ss-stage')))) break
  await sleep(100)
}
await sleep(800)
await page.evaluate(() => window.postMessage({ type: 'stageshow:control', playing: false, visible: true }, location.origin))
await sleep(300)
const cdp = await page.context().newCDPSession(page)
const box = await page.evaluate(() => { const r = document.querySelector('#example .ss-stage').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
const fpsClock = await page.evaluate(() => window.__stageshow.clock.fps)
const per = Math.max(1, Math.round(fpsClock / Number(fps)))
const frames = Math.round(Number(seconds) * Number(fps))
for (let i = 0; i < frames; i++) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: false })
  writeFileSync(`${outDir}/f${String(i).padStart(4, '0')}.png`, Buffer.from(data, 'base64'))
  await page.evaluate(async (n) => { const c = window.__stageshow.clock; await c.flushLayout(); await c.step(n); await c.flushLayout() }, per)
}
console.log(`clock fps ${fpsClock}, step ${per}, frames ${frames}, box ${JSON.stringify(box)}`)
await browser.close()
