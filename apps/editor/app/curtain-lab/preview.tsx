'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import CurtainStage from './stage'
import './preview.css'

const STATES = [
  { value: 0, title: '关闭', detail: '柔光穿过薄纱，窗框仍然可见。' },
  { value: 0.5, title: '半开', detail: '中间露出窗景，两侧褶皱逐步聚拢。' },
  { value: 1, title: '全开', detail: '帘布收在两侧，保留有厚度的自然帘束。' },
] as const

export default function CurtainPreview() {
  const [target, setTarget] = useState(0)
  const [animate, setAnimate] = useState(false)
  const [breeze, setBreeze] = useState(false)
  const [angle, setAngle] = useState(0.12)
  const [ready, setReady] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const readout = useRef<HTMLOutputElement>(null)
  const onReady = useCallback(() => setReady(true), [])
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setReducedMotion(preference.matches)
      if (preference.matches) {
        setAnimate(false)
        setBreeze(false)
      }
    }
    sync()
    preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [])

  return (
    <main className="curtain-lab" data-ready={ready}>
      <header className="lab-header">
        <div className="lab-brand">
          <span className="lab-mark">V</span>
          <span>
            VilHil <b>Studio</b>
          </span>
        </div>
        <span className="lab-edition">材质研究 / 01</span>
      </header>
      <section className="lab-title">
        <div>
          <p className="lab-eyebrow">LIGHT · FABRIC · MOTION</p>
          <h1>让光，轻轻进来。</h1>
        </div>
        <p>
          一面窗，一层纱。
          <br />
          从透光、褶皱到收拢，逐一感受。
        </p>
      </section>
      <section className="lab-layout" aria-label="纱帘交互预览">
        <div className="lab-canvas" role="group" aria-label="单窗墙与薄透纱帘三维画面">
          <CurtainStage
            target={target}
            animate={animate}
            breeze={breeze}
            angle={angle}
            onReady={onReady}
            readout={readout}
          />
          <div className="lab-canvas-label">
            <span className="lab-dot" /> 薄纱 · 暖白
          </div>
          <div className="lab-view-buttons" role="group" aria-label="观察角度">
            <button type="button" aria-pressed={angle === 0} onClick={() => setAngle(0)}>
              正面
            </button>
            <button type="button" aria-pressed={angle === 0.32} onClick={() => setAngle(0.32)}>
              侧面
            </button>
          </div>
          {!ready && <p className="lab-loading">正在展开窗景…</p>}
        </div>
        <aside className="lab-controls vh-panel">
          <p className="lab-eyebrow">01 / 开合状态</p>
          <h2>先看静态，再看流动</h2>
          <div className="lab-presets">
            {STATES.map((state, index) => (
              <button
                key={state.value}
                type="button"
                className={target === state.value ? 'lab-preset active' : 'lab-preset'}
                aria-pressed={target === state.value}
                onClick={() => setTarget(state.value)}
              >
                <span className="lab-step">0{index + 1}</span>
                <span>
                  <strong>{state.title}</strong>
                  <small>{state.detail}</small>
                </span>
                <span className="lab-percent">{state.value * 100}%</span>
              </button>
            ))}
          </div>
          <div className="lab-slider-label">
            <label htmlFor="curtain-openness">开合度</label>
            <span>{Math.round(target * 100)}%</span>
          </div>
          <input
            id="curtain-openness"
            aria-label="开合度"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(target * 100)}
            onChange={(e) => setTarget(Number(e.target.value) / 100)}
          />
          <div className="lab-toggles">
            <label>
              <span>
                平滑开合<small>轻拉帘头，底摆随后</small>
              </span>
              <input
                type="checkbox"
                checked={animate}
                disabled={reducedMotion}
                onChange={(e) => setAnimate(e.target.checked)}
              />
            </label>
            <label>
              <span>
                微风<small>轻微呼吸，不掩盖褶皱</small>
              </span>
              <input
                type="checkbox"
                checked={breeze}
                disabled={reducedMotion}
                onChange={(e) => setBreeze(e.target.checked)}
              />
            </label>
          </div>
          <output
            ref={readout}
            className="lab-status"
            aria-live="off"
            data-position="0"
            data-moving="false"
          >
            已到位 · 0%
          </output>
          {reducedMotion && <p className="lab-note">已跟随系统减少动态效果。</p>}
          <p className="lab-note">建议依次查看三个状态，再打开平滑开合。运动中可随时切换目标。</p>
        </aside>
      </section>
      <footer className="lab-footer">
        <span>纱帘视觉样本 · 独立预览</span>
        <span>单窗墙 / 柔和日光 / 双向开合</span>
      </footer>
    </main>
  )
}
