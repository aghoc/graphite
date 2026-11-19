import { Check as CheckGlyph, FolderOpen, PanelLeft, Search } from 'lucide-react'
import { Bar, Button, Collapse, Segmented, Stage, Text, Toast, Window, type Act } from '../../kit'
import './graphite.css'

// Graphite, a Markdown viewer: you are reading a lab notebook, open the raw
// editor beside it, add one to-do, and the viewer picks it up as you stop
// typing. Save, close the editor, and the notebook is one item longer.

type S = {
  editing: boolean
  /** The caret sits at the end of the DRC line, then on the new line */
  caret: 'none' | 'drc' | 'new'
  /** The new line exists in the editor (after Return) */
  newLine: boolean
  typed: string
  /** The viewer has re-rendered the typed line */
  rendered: boolean
  dirty: boolean
  saved: boolean
  /** A short cut back to the opening picture */
  fade: boolean
}

const initial: S = { editing: false, caret: 'none', newLine: false, typed: '', rendered: false, dirty: false, saved: false, fade: false }
const LINE = '- [x] LVS 통과'
const POSTER: S = { ...initial, editing: true, caret: 'new', newLine: true, typed: LINE, rendered: true, saved: true }
const REST = { x: 560, y: 372 }

async function script(a: Act<S>) {
  await a.wait(900) // a moment to read the page

  // 1. Open the editor beside the viewer
  await a.move({ at: 'seg-edit', x: 0.78, y: 0.7 })
  await a.wait(150)
  await a.click()
  await a.set({ editing: true })
  await a.wait(700)
  a.mark('open')

  // 2. Put the caret at the end of the DRC line, start a new line
  await a.move({ at: 'line-drc', x: 1, y: 0.5 })
  await a.wait(150)
  await a.click()
  await a.set({ caret: 'drc' })
  await a.wait(250)
  await a.key('return')
  await a.set({ newLine: true, caret: 'new' })
  await a.wait(200)

  // 3. Type the to-do; the viewer re-renders once typing pauses
  await a.set({ dirty: true })
  await a.type('typed', LINE)
  await a.wait(220)
  await a.set({ rendered: true })
  await a.wait(1100)
  a.mark('rendered')

  // 4. Save
  await a.key('cmd+s')
  await a.set({ dirty: false, saved: true })
  a.mark('saved')
  await a.wait(1800)
  await a.set({ saved: false })
  await a.wait(300)

  // 5. Back to reading: the editor closes, the new item stays
  await a.move({ at: 'seg-view', x: 0.78, y: 0.7 })
  await a.wait(150)
  await a.click()
  await a.set({ editing: false, caret: 'none' })
  await a.move('rest')
  await a.wait(1600)

  // A cut back to the opening picture, so the loop's reset is seen as a cut
  await a.set({ fade: true })
  await a.wait(220)
  await a.snap({ ...initial, fade: true })
  await a.set({ fade: false })
  await a.wait(500)
}

export function GraphiteDemo() {
  return (
    <Stage width={760} height={420} initial={initial} poster={POSTER} script={script} accent="#3182f6" cursor={{ at: REST }} keys="bottom-right" className="gr">
      {(s) => (
        <>
          <Window className="gr-window">
            <div className="gr-app" data-fade={s.fade || undefined}>
              {/* Graphite's own top bar */}
              <div className="gr-top">
                <span className="gr-iconbtn" aria-hidden><PanelLeft size={15} strokeWidth={1.8} /></span>
                <div className="gr-doc">
                  <span className="gr-doc__name">lab-notes.md</span>
                  <span className="gr-dirty" data-show={s.dirty || undefined}>수정됨</span>
                </div>
                <div className="gr-top__right">
                  <span className="gr-save" data-show={s.dirty || undefined}>
                    <Button variant="primary" size="small">저장</Button>
                  </span>
                  <Segmented className="gr-seg" items={['보기', '편집']} value={s.editing ? 1 : 0} targets={['seg-view', 'seg-edit']} />
                  <span className="gr-search" aria-hidden>
                    <Search size={13} strokeWidth={2} />
                    <Bar w={34} h={5} tone={2} />
                  </span>
                  <span className="gr-iconbtn" aria-hidden><FolderOpen size={15} strokeWidth={1.8} /></span>
                </div>
              </div>

              <div className="gr-body">
                {/* Table of contents */}
                <aside className="gr-toc">
                  <Bar w={28} h={5} tone={2} className="gr-toc__label" />
                  <div className="gr-toc__item"><Bar w={74} h={6} tone={3} /></div>
                  <div className="gr-toc__item gr-toc__item--l2" data-active>할 일</div>
                  <div className="gr-toc__item gr-toc__item--l2"><Bar w={52} h={6} tone={2} /></div>
                  <div className="gr-toc__item gr-toc__item--l2"><Bar w={60} h={6} tone={2} /></div>
                </aside>

                {/* Rendered document */}
                <section className="gr-viewer">
                  <div className="gr-crumbs"><Bar w={30} h={5} tone={2} /><span>/</span><Bar w={44} h={5} tone={2} /><span>/</span><b>lab-notes.md</b></div>
                  <div className="gr-h1">실습 진행 기록</div>
                  <div className="gr-p"><Bar w={214} h={6} tone={2} /><Bar w={168} h={6} tone={2} /></div>
                  <div className="gr-h2">할 일</div>
                  <div className="gr-list">
                    <Todo>레이아웃 그리기</Todo>
                    <Todo>DRC 통과</Todo>
                    <Collapse open={s.rendered}>
                      <Todo>LVS 통과</Todo>
                    </Collapse>
                  </div>
                  <div className="gr-h2 gr-h2--quiet"><Bar w={70} h={8} tone={3} /></div>
                  <div className="gr-code">
                    <Bar w={120} h={6} className="gr-code__bar" />
                    <Bar w={168} h={6} className="gr-code__bar gr-code__bar--b" />
                    <Bar w={96} h={6} className="gr-code__bar" />
                  </div>
                </section>

                {/* Raw editor, opened beside the viewer */}
                <section className="gr-editor" data-open={s.editing || undefined}>
                  <div className="gr-editor__inner">
                    <div className="gr-editor__head">
                      <span>원문 편집</span>
                      <span className="gr-kbd">⌘S 저장</span>
                    </div>
                    <div className="gr-src" data-cursor="ibeam">
                      <div className="gr-ln"># 실습 진행 기록</div>
                      <div className="gr-ln gr-ln--blank" />
                      <div className="gr-ln"><Bar w={150} h={5} tone={2} /></div>
                      <div className="gr-ln"><Bar w={110} h={5} tone={2} /></div>
                      <div className="gr-ln gr-ln--blank" />
                      <div className="gr-ln">## 할 일</div>
                      <div className="gr-ln">- [x] 레이아웃 그리기</div>
                      <div className="gr-ln"><span data-target="line-drc">- [x] DRC 통과</span>{s.caret === 'drc' && <i className="gr-caret" />}</div>
                      <Collapse open={s.newLine}>
                        <div className="gr-ln gr-ln--typed">{s.typed}{s.caret === 'new' && <i className="gr-caret" data-typing={s.typed.length > 0 && !s.rendered ? '' : undefined} />}</div>
                      </Collapse>
                      <div className="gr-ln gr-ln--blank" />
                      <div className="gr-ln"><Bar w={64} h={5} tone={2} /></div>
                      <div className="gr-ln"><Bar w={130} h={5} tone={2} /></div>
                      <div className="gr-ln"><Bar w={170} h={5} tone={2} /></div>
                    </div>
                  </div>
                </section>
              </div>

              <Toast show={s.saved} className="gr-toast" icon={<CheckGlyph size={14} strokeWidth={2.4} />}>저장했어요</Toast>
            </div>
          </Window>
          <span data-target="rest" style={{ position: 'absolute', left: REST.x, top: REST.y }} />
        </>
      )}
    </Stage>
  )
}

function Todo({ children }: { children: string }) {
  return (
    <div className="gr-todo">
      <span className="gr-box"><CheckGlyph size={10} strokeWidth={3.2} /></span>
      <Text className="gr-todo__text">{children}</Text>
    </div>
  )
}
