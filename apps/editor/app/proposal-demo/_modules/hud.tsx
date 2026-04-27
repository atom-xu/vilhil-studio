'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { DeviceNode, Subsystem } from '@pascal-app/core'
import { getDemoChromePalette, getPillColors, RENDER_PRESETS } from './render-presets'
import type { RenderPreset, RenderPresetKey } from './render-presets'
import type { DeviceData, AvailableLevel } from './types'
import type { ModuleKey } from './camera'

// ─── FPS 计数器 ────────────────────────────────────────────────────────────────
// 直接写 DOM（不走 React state），零 re-render 开销
// 颜色：绿色 ≥55fps，黄色 30-54fps，红色 <30fps

export function FpsBadge({ topBorder, topBg }: { topBorder: string; topBg: string }) {
  const numRef  = useRef<HTMLSpanElement>(null)
  const dotRef  = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frames = 0
    let last   = performance.now()
    let raf: number

    const tick = () => {
      frames++
      const now = performance.now()
      const delta = now - last
      if (delta >= 500) {
        const fps = Math.round(frames * 1000 / delta)
        frames = 0
        last   = now
        if (numRef.current)  numRef.current.textContent  = String(fps)
        const color = fps >= 55 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171'
        if (numRef.current)  numRef.current.style.color  = color
        if (dotRef.current)  dotRef.current.style.background = color
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      style={{
        marginLeft: 4,
        display: 'flex', alignItems: 'center', gap: 5,
        height: 34, padding: '0 10px',
        border: `1px solid ${topBorder}`, borderRadius: 7,
        background: topBg,
        fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
        flexShrink: 0,
      }}
    >
      {/* 状态点 */}
      <span
        ref={dotRef}
        style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', flexShrink: 0, transition: 'background 0.6s' }}
      />
      {/* 数字 */}
      <span ref={numRef} style={{ fontSize: 11, fontWeight: 600, color: '#4ade80', minWidth: 22, textAlign: 'right', transition: 'color 0.6s' }}>
        --
      </span>
      {/* 单位 */}
      <span style={{ fontSize: 9, color: 'rgba(150,165,190,0.55)', letterSpacing: '0.04em' }}>FPS</span>
    </div>
  )
}

// ─── 顶栏 ─────────────────────────────────────────────────────────────────────

type ThemeFieldKey = keyof RenderPreset['theme']
type EditorScope = 'global' | 'day' | 'night'
type EditorMode = 'quick' | 'advanced'

const THEME_FIELD_LABEL: Record<ThemeFieldKey, string> = {
  envPresetDay: '环境预设 Day',
  envPresetNight: '环境预设 Night',
  skyDay: '天空 Day',
  skyNight: '天空 Night',
  groundDay: '地面 Day',
  groundNight: '地面 Night',
  sunColorDay: '日光 Day',
  sunColorNight: '月光 Night',
  wallColor: '墙体',
  furnitureColorDay: '家具 Day',
  furnitureColorNight: '家具 Night',
  windowColor: '窗体',
  doorColor: '门体',
  capColorA: '楼层边线 A',
  capColorB: '楼层边线 B',
  capOpacity: '楼层边线透明',
  padColorDay: '楼板 Day',
  padColorNight: '楼板 Night',
  padEmissiveDay: '楼板发光 Day',
  padEmissiveNight: '楼板发光 Night',
  bgColorDay: '背景 Day',
  bgColorNight: '背景 Night',
  overlayDay: '叠层 Day',
  overlayNight: '叠层 Night',
  panelBgDay: '面板底 Day',
  panelBgNight: '面板底 Night',
  panelBorderDay: '面板边框 Day',
  panelBorderNight: '面板边框 Night',
  wallRoughness: '墙体粗糙度',
  wallMetalness: '墙体金属度',
  wallEnvMapIntensity: '墙体环境反射',
  wallOpacity: '墙体透明度',
  furnitureRoughness: '家具粗糙度',
  furnitureMetalness: '家具金属度',
  furnitureInteractiveColor: '家具交互高亮色',
}

const THEME_FIELD_HINT: Partial<Record<ThemeFieldKey, string>> = {
  wallColor: '建筑主材颜色（墙面基调）',
  furnitureColorDay: '白天家具主色（沙发、柜体、桌椅）',
  furnitureColorNight: '夜晚家具主色',
  windowColor: '窗洞/玻璃辅助色',
  doorColor: '门洞辅助色',
  capColorA: '楼层边线主色（更显眼）',
  capColorB: '楼层边线辅色（渐变过渡）',
  bgColorDay: '白天背景主色',
  bgColorNight: '夜晚背景主色',
  padColorDay: '楼板主色',
  padColorNight: '楼板夜色',
  panelBgDay: '仪表盘 UI 底色（系统项）',
  panelBgNight: '仪表盘 UI 底色（系统项）',
  panelBorderDay: '仪表盘 UI 边框（系统项）',
  panelBorderNight: '仪表盘 UI 边框（系统项）',
  overlayDay: '全局叠层光感（系统项）',
  overlayNight: '全局叠层光感（系统项）',
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function parseHexColor(input: string) {
  const value = input.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(value)
  if (short) {
    const shortHex = short[1]
    if (!shortHex) return null
    const chars = shortHex.split('')
    if (chars.length !== 3) return null
    const [cr, cg, cb] = chars
    if (!cr || !cg || !cb) return null
    const r = parseInt(cr + cr, 16)
    const g = parseInt(cg + cg, 16)
    const b = parseInt(cb + cb, 16)
    return { r, g, b, a: 1, format: 'hex' as const }
  }
  const full = /^#([0-9a-f]{6})$/i.exec(value)
  if (full) {
    const hex = full[1]
    if (!hex) return null
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
      format: 'hex' as const,
    }
  }
  const fullAlpha = /^#([0-9a-f]{8})$/i.exec(value)
  if (fullAlpha) {
    const hex = fullAlpha[1]
    if (!hex) return null
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255,
      format: 'hex' as const,
    }
  }
  return null
}

function parseRgbColor(input: string) {
  const m = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(input.trim())
  if (!m) return null
  const rToken = m[1]
  const gToken = m[2]
  const bToken = m[3]
  if (rToken == null || gToken == null || bToken == null) return null
  const r = clamp(Number(rToken), 0, 255)
  const g = clamp(Number(gToken), 0, 255)
  const b = clamp(Number(bToken), 0, 255)
  const a = m[4] == null ? 1 : clamp(Number(m[4]), 0, 1)
  if (![r, g, b, a].every(Number.isFinite)) return null
  return { r, g, b, a, format: m[4] == null ? ('rgb' as const) : ('rgba' as const) }
}

function parseEditableColor(input: string) {
  return parseHexColor(input) ?? parseRgbColor(input)
}

function toHexInput(color: { r: number; g: number; b: number }) {
  const to2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')
  return `#${to2(color.r)}${to2(color.g)}${to2(color.b)}`
}

function toCssColor(
  color: { r: number; g: number; b: number; a: number; format: 'hex' | 'rgb' | 'rgba' },
  forceRgba = false,
) {
  if (!forceRgba && color.format === 'hex' && color.a >= 0.999) return toHexInput(color)
  if (!forceRgba && color.format === 'rgb' && color.a >= 0.999) {
    return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`
  }
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${Number(color.a.toFixed(3))})`
}

export function DemoTopBar({
  buildingName, levelName, wallCount,
  displayHour, realHour, isPreviewing, isNight,
  preset,
  presetCatalog,
  activePresetKey, onPresetChange,
  onPreviewPreset, onSavePreset, onResetPreset, hasPresetOverride,
  onSliderChange, onSliderDown, onSyncNow,
  uniformWall10cm, onToggleUniformWall10cm,
  colorCalibrationMode, onToggleColorCalibrationMode,
}: {
  buildingName: string
  levelName: string
  wallCount: number
  displayHour: number
  realHour: number
  isPreviewing: boolean
  isNight: boolean
  preset: RenderPreset
  presetCatalog: Record<RenderPresetKey, RenderPreset>
  activePresetKey: RenderPresetKey
  onPresetChange: (key: RenderPresetKey) => void
  onPreviewPreset: (preset: RenderPreset | null) => void
  onSavePreset: (key: RenderPresetKey, preset: RenderPreset) => void
  onResetPreset: (key: RenderPresetKey) => void
  hasPresetOverride: (key: RenderPresetKey) => boolean
  onSliderChange: (h: number) => void
  onSliderDown: () => void
  onSyncNow: () => void
  uniformWall10cm: boolean
  onToggleUniformWall10cm: (value: boolean) => void
  colorCalibrationMode: boolean
  onToggleColorCalibrationMode: (value: boolean) => void
}) {
  const fmt = (h: number) => {
    const hh = Math.floor(h).toString().padStart(2, '0')
    const mm = Math.round((h % 1) * 60).toString().padStart(2, '0')
    return `${hh}:${mm}`
  }
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>('quick')
  const [editorScope, setEditorScope] = useState<EditorScope>('day')
  const [showUiSystemFields, setShowUiSystemFields] = useState(false)
  const buildDraft = (p: RenderPreset): RenderPreset => ({ ...p, theme: { ...p.theme } })
  const [draft, setDraft] = useState<RenderPreset>(buildDraft(presetCatalog[activePresetKey]))

  const chrome = getDemoChromePalette(isNight, preset)
  const topBg     = chrome.bg
  const topBorder = chrome.border
  const inkColor  = chrome.text
  const ink2      = chrome.text2
  const ink3      = chrome.text3
  const trackBg   = chrome.track

  const swatchPalette: Record<RenderPresetKey, [string, string, string]> = {
    opslab:   ['#18293d', '#24496f', '#5f7f9c'],
    balanced: ['#2a2f34', '#495562', '#7b8794'],
    showcase: ['#102437', '#1e3f58', '#4b697f'],
    smooth:   ['#2e3136', '#4f5560', '#7a838e'],
    night:    ['#231a30', '#44305d', '#6b4f88'],
    'mist-warm-contrast': ['#d8e6fb', '#f0d9ba', '#f7f9fd'],
  }

  const numericFields: Array<{ key: keyof RenderPreset; label: string; step: number; min?: number; max?: number }> = [
    { key: 'exposure', label: '曝光', step: 0.01, min: 0.2, max: 2.5 },
    { key: 'envDay', label: '环境 Day', step: 0.01, min: 0, max: 2 },
    { key: 'envNight', label: '环境 Night', step: 0.01, min: 0, max: 2 },
    { key: 'hemiDay', label: '半球 Day', step: 0.01, min: 0, max: 2 },
    { key: 'hemiNight', label: '半球 Night', step: 0.01, min: 0, max: 2 },
    { key: 'sunDay', label: '太阳 Day', step: 0.01, min: 0, max: 3 },
    { key: 'sunNight', label: '太阳 Night', step: 0.01, min: 0, max: 3 },
    { key: 'shadowMapSize', label: '阴影尺寸', step: 1, min: 256, max: 4096 },
    { key: 'shadowRadiusDay', label: '阴影半径 Day', step: 0.1, min: 0, max: 12 },
    { key: 'shadowRadiusNight', label: '阴影半径 Night', step: 0.1, min: 0, max: 12 },
  ]
  const quickNumericFields: Array<{ key: keyof RenderPreset; label: string; step: number; min: number; max: number }> = [
    { key: 'exposure', label: '曝光', step: 0.01, min: 0.3, max: 1.8 },
    { key: 'envDay', label: '环境光 Day', step: 0.01, min: 0, max: 1.5 },
    { key: 'envNight', label: '环境光 Night', step: 0.01, min: 0, max: 1.5 },
    { key: 'hemiDay', label: '半球光 Day', step: 0.01, min: 0, max: 1.5 },
    { key: 'hemiNight', label: '半球光 Night', step: 0.01, min: 0, max: 1.5 },
    { key: 'sunDay', label: '主光 Day', step: 0.01, min: 0, max: 2.2 },
    { key: 'sunNight', label: '主光 Night', step: 0.01, min: 0, max: 1.2 },
  ]
  const quickDayThemeFields: ThemeFieldKey[] = [
    'wallColor', 'furnitureColorDay', 'windowColor', 'doorColor',
    'padColorDay', 'bgColorDay', 'capColorA', 'capColorB',
  ]
  const quickNightThemeFields: ThemeFieldKey[] = [
    'wallColor', 'furnitureColorNight', 'windowColor', 'doorColor',
    'padColorNight', 'bgColorNight', 'capColorA', 'capColorB',
  ]
  const dayThemeFields: ThemeFieldKey[] = [
    'skyDay', 'groundDay', 'sunColorDay', 'wallColor', 'furnitureColorDay',
    'padColorDay', 'padEmissiveDay', 'bgColorDay',
  ]
  const nightThemeFields: ThemeFieldKey[] = [
    'skyNight', 'groundNight', 'sunColorNight', 'wallColor', 'furnitureColorNight',
    'padColorNight', 'padEmissiveNight', 'bgColorNight',
  ]
  const uiDayThemeFields: ThemeFieldKey[] = ['overlayDay', 'panelBgDay', 'panelBorderDay']
  const uiNightThemeFields: ThemeFieldKey[] = ['overlayNight', 'panelBgNight', 'panelBorderNight']
  const sharedThemeFields: ThemeFieldKey[] = ['wallColor', 'windowColor', 'doorColor', 'capColorA', 'capColorB']

  const isCssColorLike = (v: string) => /^#|^rgb|^hsl|^oklch|^color\(|^[a-z]+$/i.test(v.trim())
  const miniPreviewStyle = (v: string) => {
    if (isCssColorLike(v)) return { background: v }
    return {
      backgroundImage: 'linear-gradient(135deg, rgba(130,150,190,0.25), rgba(60,80,120,0.15))',
      borderStyle: 'dashed' as const,
    }
  }

  useEffect(() => {
    setDraft(buildDraft(presetCatalog[activePresetKey]))
  }, [activePresetKey, presetCatalog])

  useEffect(() => {
    if (!editorOpen) onPreviewPreset(null)
  }, [editorOpen, onPreviewPreset])

  const applyDraft = (next: RenderPreset) => {
    setDraft(next)
    onPreviewPreset(next)
  }

  const setThemeValue = (key: ThemeFieldKey, value: string) => {
    applyDraft({ ...draft, theme: { ...draft.theme, [key]: value } })
  }

  const setThemeHexColor = (key: ThemeFieldKey, hex: string) => {
    const parsed = parseEditableColor(String(draft.theme[key]))
    if (!parsed) return
    const hexParsed = parseHexColor(hex)
    if (!hexParsed) return
    const next = {
      ...hexParsed,
      a: parsed.a,
      format: parsed.a < 0.999 ? ('rgba' as const) : parsed.format,
    }
    setThemeValue(key, toCssColor(next, parsed.a < 0.999))
  }

  const setThemeAlpha = (key: ThemeFieldKey, alpha: number) => {
    const parsed = parseEditableColor(String(draft.theme[key]))
    if (!parsed) return
    setThemeValue(key, toCssColor({ ...parsed, a: clamp(alpha, 0, 1), format: 'rgba' }, true))
  }

  const renderThemeField = (key: ThemeFieldKey) => {
    const value = String(draft.theme[key])
    const parsed = parseEditableColor(value)

    return (
      <div
        key={key}
        className="rounded-md border p-2"
        style={{ borderColor: topBorder, background: isNight ? 'rgba(16,24,38,0.45)' : 'rgba(255,255,255,0.55)' }}
      >
        <div className="mb-1 flex items-center gap-2">
          <span style={{ minWidth: 96, color: ink2, fontSize: 11 }}>{THEME_FIELD_LABEL[key]}</span>
          <span
            style={{
              width: 14, height: 14, borderRadius: 3, border: `1px solid ${topBorder}`, flexShrink: 0,
              ...miniPreviewStyle(value),
            }}
          />
          {!parsed && <span style={{ fontSize: 10, color: ink3 }}>复杂值（仅文本）</span>}
        </div>
        {THEME_FIELD_HINT[key] && (
          <div className="mb-1" style={{ fontSize: 10, color: ink3 }}>
            {THEME_FIELD_HINT[key]}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setThemeValue(key, e.target.value)}
            style={{
              flex: 1, fontSize: 11, padding: '3px 6px', borderRadius: 6,
              border: `1px solid ${topBorder}`, background: 'transparent', color: inkColor,
            }}
          />
          <input
            type="color"
            value={parsed ? toHexInput(parsed) : '#3b82f6'}
            disabled={!parsed}
            onChange={(e) => setThemeHexColor(key, e.target.value)}
            style={{
              width: 30, height: 26, padding: 0, borderRadius: 6,
              border: `1px solid ${topBorder}`, background: 'transparent',
              cursor: parsed ? 'pointer' : 'not-allowed',
              opacity: parsed ? 1 : 0.35,
            }}
            title="颜色选择器"
          />
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span style={{ fontSize: 10, color: ink3, minWidth: 40 }}>透明度</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={parsed ? parsed.a : 1}
            disabled={!parsed}
            onChange={(e) => setThemeAlpha(key, Number(e.target.value))}
            style={{ flex: 1, opacity: parsed ? 1 : 0.4 }}
          />
          <span style={{ fontSize: 10, color: ink2, width: 34, textAlign: 'right' }}>
            {parsed ? `${Math.round(parsed.a * 100)}%` : '--'}
          </span>
        </div>
        {!parsed && (
          <div className="mt-1.5 flex items-center gap-2">
            <span style={{ fontSize: 10, color: ink3 }}>当前是复杂值（如 gradient），透明度请直接编辑文本中的 rgba alpha。</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex shrink-0 items-center gap-0 px-5 z-20"
      style={{ height: 56, background: topBg, borderBottom: `1px solid ${topBorder}`, transition: 'background 0.4s, border-color 0.4s' }}
    >
      {/* Brand */}
      <a href="/" className="flex items-center gap-2 no-underline" title="返回编辑器" style={{ color: inkColor, fontFamily: 'var(--font-inter), sans-serif' }}>
        <div className="relative shrink-0" style={{ width: 14, height: 14, borderRadius: 3, background: '#006FFF' }}>
          <div style={{ position: 'absolute', top: 3, right: 3, width: 4, height: 4, borderRadius: 1, background: '#fff' }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.02em' }}>VilHil</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: ink3, letterSpacing: '0.06em', marginLeft: 1 }}>STUDIO</span>
      </a>

      <div style={{ width: 1, height: 20, background: topBorder, margin: '0 16px', flexShrink: 0 }} />

      {/* Project */}
      <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: ink3, letterSpacing: '0.06em' }}>PROJECT</span>
        <span style={{ fontFamily: 'var(--font-instrument-serif), Georgia, serif', fontStyle: 'italic', fontSize: 15, color: inkColor }}>{buildingName}</span>
        <span style={{ color: ink3, fontSize: 12 }}>·</span>
        <span style={{ fontSize: 13, color: ink2 }}>{levelName}</span>
        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,111,255,0.10)', color: '#006FFF', letterSpacing: '0.04em', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
          {wallCount}W
        </span>
      </div>

      <div className="flex-1" />

      {/* Time slider widget */}
      <div
        className="relative flex items-center gap-2.5 px-3.5"
        style={{ height: 34, border: `1px solid ${topBorder}`, borderRadius: 7, background: topBg, minWidth: 220, flexShrink: 0 }}
      >
        {isNight ? (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={ink3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M20 14.5A8 8 0 119.5 4 6.5 6.5 0 0020 14.5z"/>
          </svg>
        ) : (
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={ink3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6"/>
          </svg>
        )}
        <div className="relative flex-1 cursor-pointer" style={{ height: 4, borderRadius: 2, background: trackBg }}>
          <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${(displayHour / 24) * 100}%`, background: '#006FFF', borderRadius: 2 }} />
          <div style={{
            position: 'absolute', top: '50%', left: `${(displayHour / 24) * 100}%`,
            width: 12, height: 12, borderRadius: '50%', background: '#006FFF',
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 0 3px ${topBg}, 0 0 0 4px #006FFF`,
            pointerEvents: 'none',
          }} />
          <input
            type="range" min={0} max={24} step={0.25}
            value={displayHour}
            onPointerDown={onSliderDown}
            onChange={(e) => onSliderChange(Number(e.target.value))}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', margin: 0 }}
          />
        </div>
        <span className="tabular-nums text-right shrink-0" style={{ minWidth: 38, fontSize: 11, color: ink2, fontFamily: '"JetBrains Mono",monospace' }}>
          {fmt(displayHour)}
        </span>
        {isPreviewing && (
          <button
            type="button"
            onClick={onSyncNow}
            style={{ fontSize: 10, color: '#006FFF', background: 'rgba(0,111,255,0.10)', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', flexShrink: 0 }}
            title={`同步到现在 ${fmt(realHour)}`}
          >↺</button>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: topBorder, margin: '0 12px', flexShrink: 0 }} />

      {/* ⚙ Tweaks */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setTweaksOpen((o) => !o)}
          style={{
            width: 34, height: 34, border: `1px solid ${topBorder}`, borderRadius: 7,
            background: tweaksOpen ? (isNight ? '#1F2431' : '#F6F7F9') : topBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: tweaksOpen ? inkColor : ink2, cursor: 'pointer',
          }}
          title="渲染风格"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
        {tweaksOpen && (
          <div
            className="absolute right-0 top-full mt-2 rounded-xl border overflow-hidden z-30"
            style={{ background: topBg, borderColor: topBorder, minWidth: 200, boxShadow: isNight ? '0 20px 60px rgba(2,8,18,.38)' : '0 20px 60px rgba(10,14,20,.12)' }}
          >
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b" style={{ borderColor: topBorder }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: inkColor }}>渲染风格</span>
              <button type="button" onClick={() => setTweaksOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ink3, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
            <div className="px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                {(Object.keys(RENDER_PRESETS) as RenderPresetKey[]).map((key) => {
                  const p = presetCatalog[key] ?? RENDER_PRESETS[key]
                  const active = p.key === activePresetKey
                  const [c0, c1, c2] = swatchPalette[p.key]
                  const swatchBg = `radial-gradient(125% 125% at 18% 14%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0) 58%), linear-gradient(145deg, ${c0} 0%, ${c1} 56%, ${c2} 100%)`
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => { onPresetChange(p.key) }}
                      className="relative transition-all duration-200"
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: swatchBg,
                        border: `1px solid ${active ? 'rgba(41,74,112,0.9)' : 'rgba(110,132,158,0.34)'}`,
                        opacity: active ? 1 : 0.72,
                        transform: active ? 'scale(1.18)' : 'scale(1)',
                        cursor: 'pointer',
                      }}
                      title={`${p.label} · ${p.description}`}
                    >
                      {active && (
                        <span className="pointer-events-none absolute -inset-1 rounded-full border"
                          style={{ borderColor: isNight ? 'rgba(186,210,238,0.82)' : 'rgba(78,124,178,0.72)' }} />
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 text-[10px]" style={{ color: ink3 }}>当前：{preset.label}</div>
              <div
                className="mt-2 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                style={{ borderColor: topBorder, background: isNight ? 'rgba(16,24,38,0.35)' : 'rgba(245,249,255,0.55)' }}
              >
                <div className="min-w-0">
                  <div style={{ fontSize: 11, color: ink2 }}>实验：统一墙厚 10cm</div>
                  <div style={{ fontSize: 10, color: ink3 }}>作用于全部楼层与全部模块（可随时关闭）</div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleUniformWall10cm(!uniformWall10cm)}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 999,
                    border: `1px solid ${uniformWall10cm ? 'rgba(0,111,255,0.55)' : topBorder}`,
                    background: uniformWall10cm ? 'rgba(0,111,255,0.22)' : 'transparent',
                    cursor: 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                  }}
                  title={uniformWall10cm ? '已开启' : '已关闭'}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: uniformWall10cm ? 20 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: uniformWall10cm ? '#006FFF' : (isNight ? '#8FA9CA' : '#A8B9CE'),
                      transition: 'left 0.18s ease',
                    }}
                  />
                </button>
              </div>
              <div
                className="mt-2 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                style={{ borderColor: topBorder, background: isNight ? 'rgba(16,24,38,0.35)' : 'rgba(245,249,255,0.55)' }}
              >
                <div className="min-w-0">
                  <div style={{ fontSize: 11, color: ink2 }}>颜色校准模式</div>
                  <div style={{ fontSize: 10, color: ink3 }}>中性光源 + 关闭后期，专门用于精确调色</div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleColorCalibrationMode(!colorCalibrationMode)}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 999,
                    border: `1px solid ${colorCalibrationMode ? 'rgba(0,111,255,0.55)' : topBorder}`,
                    background: colorCalibrationMode ? 'rgba(0,111,255,0.22)' : 'transparent',
                    cursor: 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                  }}
                  title={colorCalibrationMode ? '已开启' : '已关闭'}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: colorCalibrationMode ? 20 : 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: colorCalibrationMode ? '#006FFF' : (isNight ? '#8FA9CA' : '#A8B9CE'),
                      transition: 'left 0.18s ease',
                    }}
                  />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditorOpen((v) => !v)}
                  style={{
                    fontSize: 10,
                    borderRadius: 6,
                    border: `1px solid ${topBorder}`,
                    padding: '4px 8px',
                    background: editorOpen ? (isNight ? 'rgba(72,122,200,0.2)' : 'rgba(0,111,255,0.12)') : 'transparent',
                    color: ink2,
                    cursor: 'pointer',
                  }}
                >
                  {editorOpen ? '收起高级编辑' : '高级编辑'}
                </button>
                {hasPresetOverride(activePresetKey) && (
                  <span style={{ fontSize: 10, color: '#0ea5e9' }}>已覆盖</span>
                )}
              </div>
              {editorOpen && (
                <div
                  className="mt-3 space-y-3 rounded-lg border p-2"
                  style={{
                    borderColor: topBorder,
                    background: isNight ? 'rgba(8,14,25,0.45)' : 'rgba(245,249,255,0.65)',
                    maxHeight: 420,
                    overflow: 'auto',
                  }}
                >
                  <div className="text-[10px]" style={{ color: ink3 }}>
                    正在编辑：{draft.label}（{draft.key}）
                  </div>

                  <div className="flex items-center gap-1 rounded-md border p-1" style={{ borderColor: topBorder }}>
                    {([
                      ['quick', '快速调色'],
                      ['advanced', '高级模式'],
                    ] as Array<[EditorMode, string]>).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEditorMode(mode)}
                        style={{
                          flex: 1,
                          fontSize: 10,
                          padding: '4px 6px',
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          color: editorMode === mode ? '#006FFF' : ink2,
                          background: editorMode === mode ? (isNight ? 'rgba(40,92,170,0.24)' : 'rgba(0,111,255,0.12)') : 'transparent',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {editorMode === 'quick' ? (
                    <>
                      <div className="space-y-2">
                        <div className="text-[10px]" style={{ color: ink3 }}>核心光照参数</div>
                        {quickNumericFields.map((f) => (
                          <div key={String(f.key)} className="rounded-md border px-2 py-1.5" style={{ borderColor: topBorder }}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span style={{ color: ink2, fontSize: 11 }}>{f.label}</span>
                              <span style={{ fontSize: 10, color: ink3 }}>{Number((draft[f.key] as number).toFixed(2))}</span>
                            </div>
                            <input
                              type="range"
                              min={f.min}
                              max={f.max}
                              step={f.step}
                              value={Number(draft[f.key] as number)}
                              onChange={(e) => {
                                const raw = Number(e.target.value)
                                const next = { ...draft, [f.key]: Number.isFinite(raw) ? raw : (draft[f.key] as number) } as RenderPreset
                                applyDraft(next)
                              }}
                              style={{ width: '100%' }}
                            />
                          </div>
                        ))}
                      </div>

                      <label className="flex items-center justify-between gap-2">
                        <span style={{ color: ink2, fontSize: 11 }}>边线透明度</span>
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          value={draft.theme.capOpacity}
                          onChange={(e) => {
                            const raw = Number(e.target.value)
                            const next = { ...draft, theme: { ...draft.theme, capOpacity: Number.isFinite(raw) ? raw : draft.theme.capOpacity } }
                            applyDraft(next)
                          }}
                          style={{
                            width: 92, fontSize: 11, padding: '3px 6px', borderRadius: 6,
                            border: `1px solid ${topBorder}`, background: 'transparent', color: inkColor,
                          }}
                        />
                      </label>

                      <div className="space-y-2">
                        <div className="text-[10px]" style={{ color: ink3 }}>
                          快速色板：只保留常用可见色，避免调色噪音。
                        </div>
                        <div className="flex items-center gap-1 rounded-md border p-1" style={{ borderColor: topBorder }}>
                          {([
                            ['day', '白天'],
                            ['night', '夜晚'],
                          ] as Array<[EditorScope, string]>).map(([scope, label]) => (
                            <button
                              key={scope}
                              type="button"
                              onClick={() => setEditorScope(scope)}
                              style={{
                                flex: 1,
                                fontSize: 10,
                                padding: '4px 6px',
                                borderRadius: 6,
                                border: 'none',
                                cursor: 'pointer',
                                color: editorScope === scope ? '#006FFF' : ink2,
                                background: editorScope === scope ? (isNight ? 'rgba(40,92,170,0.24)' : 'rgba(0,111,255,0.12)') : 'transparent',
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="space-y-1.5">
                          {editorScope === 'day' && quickDayThemeFields.map(renderThemeField)}
                          {editorScope === 'night' && quickNightThemeFields.map(renderThemeField)}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <div className="text-[10px]" style={{ color: ink3 }}>基础参数</div>
                        {numericFields.map((f) => (
                          <label key={String(f.key)} className="flex items-center justify-between gap-2">
                            <span style={{ color: ink2, fontSize: 11 }}>{f.label}</span>
                            <input
                              type="number"
                              step={f.step}
                              min={f.min}
                              max={f.max}
                              value={String(draft[f.key] as number)}
                              onChange={(e) => {
                                const raw = Number(e.target.value)
                                const next = { ...draft, [f.key]: Number.isFinite(raw) ? raw : (draft[f.key] as number) } as RenderPreset
                                applyDraft(next)
                              }}
                              style={{
                                width: 92, fontSize: 11, padding: '3px 6px', borderRadius: 6,
                                border: `1px solid ${topBorder}`, background: 'transparent', color: inkColor,
                              }}
                            />
                          </label>
                        ))}
                      </div>

                      <label className="flex items-center justify-between gap-2">
                        <span style={{ color: ink2, fontSize: 11 }}>边线透明度</span>
                        <input
                          type="number"
                          step={0.01}
                          min={0}
                          max={1}
                          value={draft.theme.capOpacity}
                          onChange={(e) => {
                            const raw = Number(e.target.value)
                            const next = { ...draft, theme: { ...draft.theme, capOpacity: Number.isFinite(raw) ? raw : draft.theme.capOpacity } }
                            applyDraft(next)
                          }}
                          style={{
                            width: 92, fontSize: 11, padding: '3px 6px', borderRadius: 6,
                            border: `1px solid ${topBorder}`, background: 'transparent', color: inkColor,
                          }}
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span style={{ color: ink3, fontSize: 10 }}>环境 Day</span>
                      <select
                        value={draft.theme.envPresetDay}
                        onChange={(e) => {
                          const next = { ...draft, theme: { ...draft.theme, envPresetDay: e.target.value as RenderPreset['theme']['envPresetDay'] } }
                          applyDraft(next)
                        }}
                        style={{ width: '100%', fontSize: 11, padding: '4px 6px', borderRadius: 6, border: `1px solid ${topBorder}`, background: 'transparent', color: inkColor }}
                      >
                        <option value="apartment">apartment</option>
                        <option value="city">city</option>
                        <option value="studio">studio</option>
                        <option value="warehouse">warehouse</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span style={{ color: ink3, fontSize: 10 }}>环境 Night</span>
                      <select
                        value={draft.theme.envPresetNight}
                        onChange={(e) => {
                          const next = { ...draft, theme: { ...draft.theme, envPresetNight: e.target.value as RenderPreset['theme']['envPresetNight'] } }
                          applyDraft(next)
                        }}
                        style={{ width: '100%', fontSize: 11, padding: '4px 6px', borderRadius: 6, border: `1px solid ${topBorder}`, background: 'transparent', color: inkColor }}
                      >
                        <option value="night">night</option>
                        <option value="city">city</option>
                        <option value="warehouse">warehouse</option>
                        <option value="studio">studio</option>
                      </select>
                    </label>
                      </div>

                      <div className="space-y-2">
                        <div style={{ fontSize: 10, color: ink3 }}>
                          默认只展示“建筑和家具可见色”。系统 UI 色放在高级项，避免信息过载。
                        </div>
                        <div className="flex items-center gap-1 rounded-md border p-1" style={{ borderColor: topBorder }}>
                          {([
                            ['day', '白天'],
                            ['night', '夜晚'],
                            ['global', '共享'],
                          ] as Array<[EditorScope, string]>).map(([scope, label]) => (
                            <button
                              key={scope}
                              type="button"
                              onClick={() => setEditorScope(scope)}
                              style={{
                                flex: 1,
                                fontSize: 10,
                                padding: '4px 6px',
                                borderRadius: 6,
                                border: 'none',
                                cursor: 'pointer',
                                color: editorScope === scope ? '#006FFF' : ink2,
                                background: editorScope === scope ? (isNight ? 'rgba(40,92,170,0.24)' : 'rgba(0,111,255,0.12)') : 'transparent',
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-1.5">
                          {editorScope === 'day' && dayThemeFields.map(renderThemeField)}
                          {editorScope === 'night' && nightThemeFields.map(renderThemeField)}
                          {editorScope === 'global' && sharedThemeFields.map(renderThemeField)}
                          {(editorScope === 'day' || editorScope === 'night') && (
                            <div className="rounded-md border p-2" style={{ borderColor: topBorder }}>
                              <button
                                type="button"
                                onClick={() => setShowUiSystemFields((v) => !v)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  fontSize: 11,
                                  border: 'none',
                                  background: 'transparent',
                                  color: ink2,
                                  cursor: 'pointer',
                                }}
                              >
                                {showUiSystemFields ? '收起' : '展开'} 系统 UI 颜色（面板/叠层）
                              </button>
                              {showUiSystemFields && (
                                <div className="mt-2 space-y-1.5">
                                  {editorScope === 'day' && uiDayThemeFields.map(renderThemeField)}
                                  {editorScope === 'night' && uiNightThemeFields.map(renderThemeField)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const fallback = buildDraft(presetCatalog[activePresetKey])
                        setDraft(fallback)
                        onPreviewPreset(null)
                      }}
                      style={{
                        fontSize: 11, borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                        border: `1px solid ${topBorder}`, background: 'transparent', color: ink2,
                      }}
                    >
                      取消预览
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onResetPreset(activePresetKey)
                        const fallback = buildDraft(RENDER_PRESETS[activePresetKey])
                        setDraft(fallback)
                        onPreviewPreset(null)
                      }}
                      style={{
                        fontSize: 11, borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                        border: `1px solid ${topBorder}`, background: 'transparent', color: '#ef4444',
                      }}
                    >
                      恢复默认
                    </button>
                    <button
                      type="button"
                      onClick={() => onSavePreset(activePresetKey, draft)}
                      style={{
                        fontSize: 11, borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                        border: `1px solid rgba(0,111,255,0.45)`, background: 'rgba(0,111,255,0.12)', color: '#006FFF',
                      }}
                    >
                      保存覆盖
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FPS 计数器 */}
      <FpsBadge topBorder={topBorder} topBg={topBg} />
    </div>
  )
}

// ─── 左侧导航栏 ────────────────────────────────────────────────────────────────

export function DemoRail({
  isNight,
  preset,
  activeModule,
  isGlobalOverview,
  onModuleClick,
  onOverviewClick,
}: {
  isNight: boolean
  preset: RenderPreset
  activeModule: ModuleKey
  /** true = 当前处于全屋总览，overview 按钮高亮，子系统按钮不高亮 */
  isGlobalOverview: boolean
  onModuleClick: (module: ModuleKey) => void
  onOverviewClick: () => void
}) {
  const chrome = getDemoChromePalette(isNight, preset)
  const railBg     = chrome.bg
  const railBorder = chrome.border
  const ink3       = chrome.text3

  type RailEntry = { id: string; tip: string; color: string; icon: React.ReactNode; active?: boolean }

  const entries: (RailEntry | null)[] = [
    {
      id: 'overview', tip: '全屋总览', color: '#006AFF',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1z"/>
          <path d="M9 21V14h6v7"/>
        </svg>
      ),
    },
    null,
    {
      id: 'architecture', tip: '架构', color: '#94a3b8',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <rect x="7" y="7" width="10" height="10" rx="2"/>
          <line x1="7" y1="10" x2="4" y2="10"/><line x1="7" y1="14" x2="4" y2="14"/>
          <line x1="17" y1="10" x2="20" y2="10"/><line x1="17" y1="14" x2="20" y2="14"/>
          <line x1="10" y1="7" x2="10" y2="4"/><line x1="14" y1="7" x2="14" y2="4"/>
          <line x1="10" y1="17" x2="10" y2="20"/><line x1="14" y1="17" x2="14" y2="20"/>
        </svg>
      ),
    },
    {
      id: 'lighting', tip: '灯光', color: '#d4a853',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M9 18h6"/>
          <path d="M10 21h4"/>
          <path d="M9 18c-1.2-1-3-3.2-3-6a6 6 0 1112 0c0 2.8-1.8 5-3 6"/>
          <path d="M12 2v1.5" opacity="0.5"/>
          <path d="M18.5 5.5l-1 1" opacity="0.5"/>
          <path d="M5.5 5.5l1 1" opacity="0.5"/>
        </svg>
      ),
    },
    {
      id: 'panel', tip: '面板', color: '#c8b8a0',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <rect x="4" y="4" width="16" height="16" rx="2.5"/>
          <line x1="12" y1="6" x2="12" y2="18"/>
          <circle cx="8" cy="10" r="1"/>
          <circle cx="16" cy="14" r="1"/>
        </svg>
      ),
    },
    {
      id: 'sensor', tip: '传感器', color: '#4ade80',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" width={20} height={20}>
          <circle cx="12" cy="12" r="2"/>
          <path d="M16.24 7.76a6 6 0 010 8.49"/>
          <path d="M19.07 4.93a10 10 0 010 14.14"/>
          <path d="M7.76 16.24a6 6 0 010-8.49"/>
          <path d="M4.93 19.07a10 10 0 010-14.14"/>
        </svg>
      ),
    },
    {
      id: 'curtain', tip: '遮阳', color: '#3dd9b6',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <line x1="3" y1="4" x2="21" y2="4"/>
          <line x1="5" y1="4" x2="5" y2="6"/><line x1="19" y1="4" x2="19" y2="6"/>
          <line x1="5" y1="8" x2="19" y2="8"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
          <line x1="5" y1="16" x2="19" y2="16"/>
          <line x1="5" y1="20" x2="19" y2="20"/>
        </svg>
      ),
    },
    {
      id: 'hvac', tip: '暖通', color: '#9b7bea',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M10 17.66V6a2 2 0 014 0v11.66a4 4 0 11-4 0z"/>
          <line x1="12" y1="17" x2="12" y2="10"/>
          <path d="M18 9a3 3 0 010 4" opacity="0.5"/>
          <path d="M20.5 7.5a6 6 0 010 7" opacity="0.3"/>
        </svg>
      ),
    },
    {
      id: 'av', tip: '影音', color: '#5ba0f5',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <rect x="2" y="4" width="20" height="13" rx="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      ),
    },
    {
      id: 'security', tip: '安防', color: '#f59e0b',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M12 3L4 7v4c0 5 3.3 9.3 8 11 4.7-1.7 8-6 8-11V7l-8-4z"/>
          <circle cx="12" cy="12" r="2.5"/>
          <circle cx="12" cy="12" r="0.8"/>
        </svg>
      ),
    },
    {
      id: 'network', tip: '网络', color: '#60a5fa',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" width={20} height={20}>
          <circle cx="12" cy="19" r="1.5"/>
          <path d="M8.5 15.5a5 5 0 017 0"/>
          <path d="M5.5 12.5a9 9 0 0113 0"/>
          <path d="M2.5 9.5a13 13 0 0119 0"/>
        </svg>
      ),
    },
  ]

  return (
    <div
      className="flex shrink-0 flex-col py-3 z-10"
      style={{ width: 64, background: railBg, borderRight: `1px solid ${railBorder}`, transition: 'background 0.4s' }}
    >
      {entries.map((entry, i) => {
        if (entry === null) {
          return <div key={i} style={{ height: 1, background: railBorder, margin: '6px 12px' }} />
        }
        const { id, tip, color, icon } = entry
        const isActive = id === 'overview' ? isGlobalOverview : (!isGlobalOverview && id === activeModule)
        const activeBg = `color-mix(in srgb, ${color} ${isNight ? '14%' : '8%'}, transparent)`
        const handleClick = () => {
          if (id === 'overview') {
            onOverviewClick()
          } else {
            onModuleClick(id as ModuleKey)
          }
        }
        return (
          <div key={id} className="group relative flex justify-center">
            {/* v0.3 left-border active indicator */}
            {isActive && (
              <div style={{
                position: 'absolute', left: 0, top: 9, height: 26, width: 2.5,
                borderRadius: '0 2px 2px 0', background: color, pointerEvents: 'none',
              }} />
            )}
            <button
              type="button"
              onClick={handleClick}
              style={{
                width: 44, height: 44, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none',
                color: isActive ? color : ink3,
                background: isActive ? activeBg : 'transparent',
                cursor: 'pointer', position: 'relative',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.color = isNight ? '#E0E4EC' : '#1E2329'
                  b.style.background = 'rgba(0,106,255,0.04)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  const b = e.currentTarget as HTMLButtonElement
                  b.style.color = ink3
                  b.style.background = 'transparent'
                }
              }}
              title={tip}
            >
              {icon}
            </button>
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{
                position: 'absolute', left: 56, top: '50%', transform: 'translateY(-50%)',
                background: chrome.bg,
                color: chrome.text,
                border: `1px solid ${chrome.border}`,
                padding: '4px 8px', borderRadius: 5, fontSize: 11, whiteSpace: 'nowrap' as const,
                zIndex: 30,
              }}
            >
              {tip}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── 场景 dock ────────────────────────────────────────────────────────────────

export interface SceneConfig {
  id: string
  label: string
  icon: React.ReactNode
  roomBrightness: number                                          // 0-100，控制 base lighting 层亮度
  getStates: (devices: DeviceData[]) => Record<string, { on: boolean; brightness: number }>  // 控制已配置灯具（可以没有）
}

export const DEMO_SCENES: SceneConfig[] = [
  {
    id: 'arrive',
    label: '回家',
    roomBrightness: 75,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M2 7L8 2l6 5v7H2z" /><path d="M6 14V9h4v5" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: true, brightness: 75 }])),
  },
  {
    id: 'leave',
    label: '离家',
    roomBrightness: 0,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M10 11l4-3-4-3" /><path d="M14 8H6" /><path d="M6 13H3a1 1 0 01-1-1V4a1 1 0 011-1h3" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: false, brightness: 0 }])),
  },
  {
    id: 'morning',
    label: '晨起',
    roomBrightness: 45,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M11.5 4.5l1.4-1.4M3.1 12.9l1.4-1.4" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: true, brightness: 45 }])),
  },
  {
    id: 'dining',
    label: '用餐',
    roomBrightness: 92,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M5 2v5a2 2 0 002 2v5M9 2v12M11 2v4a2 2 0 002 2v6" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: true, brightness: 92 }])),
  },
  {
    id: 'cinema',
    label: '观影',
    roomBrightness: 8,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><rect x="1" y="3" width="14" height="10" rx="1" /><path d="M8 13v2M5 15h6" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map((d, i) => [d.id, { on: i === 0, brightness: 12 }])),
  },
  {
    id: 'sleep',
    label: '睡眠',
    roomBrightness: 0,
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M12 8A6 6 0 014 4a6 6 0 108 8z" /></svg>,
    getStates: (devices) => Object.fromEntries(devices.map(d => [d.id, { on: false, brightness: 0 }])),
  },
]

// ═══════════════════════════════════════════════════════════════════════════
//  FloorSwitcher —— 左侧极简楼层切换器
// ═══════════════════════════════════════════════════════════════════════════

export function FloorSwitcher({
  levels,
  currentLevelId,
  onChange,
  isNight,
  preset,
}: {
  levels: AvailableLevel[]
  /** 当前楼层 id；null = 全屋模式 */
  currentLevelId: string | null
  /** null = 全屋，string = 指定楼层 */
  onChange: (levelId: string | null) => void
  isNight: boolean
  preset: RenderPreset
}) {
  if (levels.length < 1) return null

  const chrome = getDemoChromePalette(isNight, preset)
  const lineColor = isNight ? 'rgba(224, 228, 236, 0.45)' : 'rgba(30, 35, 41, 0.35)'
  const activeColor = '#006AFF'

  const entries: Array<{ id: string | null; label: string; sub?: string }> = [
    { id: null, label: '全屋' },
    ...levels.map((lvl) => ({
      id: lvl.id,
      label: lvl.name,
      sub: `${lvl.area}m² · ${lvl.deviceCount}台`,
    })),
  ]

  return (
    <div
      className="pointer-events-auto flex flex-col items-center justify-center gap-1"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: 80,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 15,
        width: 56,
        padding: '12px 4px',
      }}
    >
      {entries.map((entry) => {
        const isActive = entry.id === currentLevelId
        return (
          <button
            key={entry.id ?? '__all__'}
            type="button"
            onClick={() => onChange(entry.id)}
            className="group relative flex items-center"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 0',
              width: '100%',
              justifyContent: 'center',
            }}
            aria-label={entry.label}
          >
            <div
              className="transition-all duration-200 ease-out group-hover:w-10"
              style={{
                height: 2,
                width: isActive ? 24 : 12,
                background: isActive ? activeColor : lineColor,
                borderRadius: 1,
              }}
            />
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
              style={{
                position: 'absolute',
                left: 52,
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '6px 10px',
                background: chrome.bg,
                color: chrome.text,
                fontSize: 11,
                lineHeight: 1.4,
                borderRadius: 6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                border: `1px solid ${chrome.border}`,
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontWeight: 600 }}>{entry.label}</div>
              {entry.sub && <div style={{ opacity: 0.6, fontSize: 10 }}>{entry.sub}</div>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  DashboardPanel —— 右侧仪表盘
// ═══════════════════════════════════════════════════════════════════════════

const SUBSYSTEM_TILE_ORDER: Array<{
  id: Subsystem
  label: string
  color: string
  svg: React.ReactNode
}> = [
  { id: 'architecture', label: '架构', color: '#94a3b8',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><rect x="7" y="7" width="10" height="10" rx="2"/><line x1="7" y1="10" x2="4" y2="10"/><line x1="7" y1="14" x2="4" y2="14"/><line x1="17" y1="10" x2="20" y2="10"/><line x1="17" y1="14" x2="20" y2="14"/></svg> },
  { id: 'lighting', label: '灯光', color: '#d4a853',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><path d="M9 18h6"/><path d="M10 21h4"/><path d="M9 18c-1.2-1-3-3.2-3-6a6 6 0 1112 0c0 2.8-1.8 5-3 6"/></svg> },
  { id: 'panel', label: '面板', color: '#c8b8a0',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><rect x="4" y="4" width="16" height="16" rx="2.5"/><line x1="12" y1="6" x2="12" y2="18"/><circle cx="8" cy="10" r="1"/><circle cx="16" cy="14" r="1"/></svg> },
  { id: 'sensor', label: '传感', color: '#4ade80',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49"/><path d="M7.76 16.24a6 6 0 010-8.49"/></svg> },
  { id: 'curtain', label: '遮阳', color: '#3dd9b6',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><line x1="3" y1="4" x2="21" y2="4"/><line x1="5" y1="8" x2="19" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="16" x2="19" y2="16"/><line x1="5" y1="20" x2="19" y2="20"/></svg> },
  { id: 'hvac', label: '暖通', color: '#9b7bea',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><path d="M10 17.66V6a2 2 0 014 0v11.66a4 4 0 11-4 0z"/><line x1="12" y1="17" x2="12" y2="10"/></svg> },
  { id: 'av', label: '影音', color: '#5ba0f5',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><rect x="2" y="4" width="20" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/></svg> },
  { id: 'security', label: '安防', color: '#f59e0b',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><path d="M12 3L4 7v4c0 5 3.3 9.3 8 11 4.7-1.7 8-6 8-11V7l-8-4z"/><circle cx="12" cy="12" r="2.5"/></svg> },
  { id: 'network', label: '网络', color: '#60a5fa',
    svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" width={18} height={18}><circle cx="12" cy="19" r="1.5"/><path d="M8.5 15.5a5 5 0 017 0"/><path d="M5.5 12.5a9 9 0 0113 0"/><path d="M2.5 9.5a13 13 0 0119 0"/></svg> },
]

export function DashboardPanel({
  buildingName,
  levelName,
  area,
  deviceNodes,
  activeSceneLabel,
  activeSceneStartedAt,
  isNight,
  preset,
  lightsOn,
  lightsTotal,
}: {
  buildingName: string
  levelName: string
  area: number
  deviceNodes: DeviceNode[]
  /** 当前运行场景（null 时底部场景区域隐藏） */
  activeSceneLabel: string | null
  /** 场景触发时戳（毫秒 epoch），用于"已运行 X:XX" */
  activeSceneStartedAt: number | null
  isNight: boolean
  preset: RenderPreset
  /** 在线灯具 X/Y（运行态信息，和 3D 灯光呼应；0 台时整行不显示） */
  lightsOn?: number
  lightsTotal?: number
}) {
  // 每子系统设备数（忽略 visible 过滤）
  const countBySubsystem = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of deviceNodes) map[d.subsystem] = (map[d.subsystem] ?? 0) + 1
    return map
  }, [deviceNodes])

  // 完整度 = 子系统覆盖率（≥1 台即算覆盖）
  const coveredCount = SUBSYSTEM_TILE_ORDER.filter((s) => (countBySubsystem[s.id] ?? 0) > 0).length
  const coverage = Math.round((coveredCount / SUBSYSTEM_TILE_ORDER.length) * 100)

  // 当前场景已运行时长（分:秒，每秒更新）
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    if (activeSceneStartedAt == null) { setElapsed(''); return }
    const tick = () => {
      const sec = Math.floor((Date.now() - activeSceneStartedAt) / 1000)
      const m = Math.floor(sec / 60)
      const s = sec % 60
      setElapsed(`${m}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeSceneStartedAt])

  const chrome = getDemoChromePalette(isNight, preset)
  const bg = chrome.bg
  const border = chrome.border
  const textPrimary = chrome.text
  const textSecondary = chrome.text3
  const tileBg = isNight ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.025)'

  // Donut 配置
  const size = 104
  const stroke = 8
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference * (1 - coverage / 100)

  return (
    <div
      className="pointer-events-auto"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 260,
        padding: 16,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 14,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: textPrimary,
        fontSize: 12,
        zIndex: 15,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
      }}
    >
      {/* 方案头 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{buildingName}</div>
        <div style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>
          {levelName} · {area} m²
        </div>
        {/* 在线灯具 —— 和 3D 内亮灯数呼应的唯一副数据 */}
        {lightsTotal != null && lightsTotal > 0 && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10.5,
              color: textSecondary,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width={11} height={11} style={{ flexShrink: 0 }}>
              <path d="M9 18h6"/><path d="M10 21h4"/><path d="M9 18c-1.2-1-3-3.2-3-6a6 6 0 1112 0c0 2.8-1.8 5-3 6"/>
            </svg>
            {lightsOn ?? 0}/{lightsTotal} 亮
          </div>
        )}
      </div>

      {/* 环形：方案完整度 */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 16px' }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={isNight ? '#2a313d' : '#e5e7eb'} strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#006AFF" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />
          <text
            x={size / 2} y={size / 2 - 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={24} fontWeight={600} fill={textPrimary}
          >
            {coverage}%
          </text>
          <text
            x={size / 2} y={size / 2 + 18}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fill={textSecondary}
          >
            方案完整度
          </text>
        </svg>
      </div>

      {/* 3×3 子系统 tile */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {SUBSYSTEM_TILE_ORDER.map((s) => {
          const count = countBySubsystem[s.id] ?? 0
          const active = count > 0
          return (
            <div
              key={s.id}
              style={{
                background: tileBg,
                borderRadius: 8,
                padding: '8px 4px 6px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity: active ? 1 : 0.35,
                transition: 'opacity 200ms',
              }}
            >
              <div style={{ color: active ? s.color : textSecondary, marginBottom: 2 }}>
                {s.svg}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: active ? textPrimary : textSecondary }}>
                {count}
              </div>
              <div style={{ fontSize: 9.5, color: textSecondary, marginTop: 1 }}>
                {s.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* 当前场景 —— 只在执行时显示 */}
      {activeSceneLabel && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: isNight ? 'rgba(0, 106, 255, 0.12)' : 'rgba(0, 106, 255, 0.06)',
            borderRadius: 8,
            borderLeft: '2px solid #006AFF',
          }}
        >
          <div style={{ fontSize: 11, color: textSecondary, marginBottom: 2 }}>▶ 当前场景</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{activeSceneLabel}</span>
            {elapsed && (
              <span style={{ fontSize: 11, color: textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                {elapsed}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function SceneDock({
  activeSceneId,
  isNight,
  preset,
  onExecute,
  onAllOn,
  onAllOff,
}: {
  activeSceneId: string | null
  isNight: boolean
  preset: RenderPreset
  onExecute: (scene: SceneConfig) => void
  onAllOn: () => void
  onAllOff: () => void
}) {
  const chrome = getDemoChromePalette(isNight, preset)
  const panelBg     = chrome.bg
  const panelBorder = chrome.border
  const textColor   = chrome.text
  const mutedColor  = chrome.text3

  return (
    <div className="pointer-events-none absolute bottom-5 left-0 right-0 z-10 flex justify-center">
      <div
        className="pointer-events-auto flex items-center gap-0.5 rounded-2xl border px-2 py-1.5 backdrop-blur-xl"
        style={{ background: panelBg, borderColor: panelBorder }}
      >
        {DEMO_SCENES.map((scene) => {
          const isActive = activeSceneId === scene.id
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onExecute(scene)}
              className="flex flex-col items-center gap-1.5 rounded-xl px-3.5 py-2 transition-all duration-200"
              style={{
                background:  isActive ? chrome.chip : 'transparent',
                border:      `1px solid ${isActive ? chrome.chipBorder : 'transparent'}`,
                color:       isActive ? '#006FFF' : textColor,
                minWidth:    52,
              }}
            >
              <div style={{ opacity: isActive ? 1 : 0.6 }}>{scene.icon}</div>
              <span className="font-medium text-[10px] leading-none tracking-[0.03em]">{scene.label}</span>
            </button>
          )
        })}

        <div className="mx-1.5 h-7 w-px self-center" style={{ background: panelBorder }} />

        <button
          type="button"
          onClick={onAllOn}
          className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all duration-200"
          onMouseEnter={(e) => { e.currentTarget.style.background = chrome.hover }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          style={{ color: mutedColor, minWidth: 40 }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
            <circle cx="8" cy="8" r="3" fill="currentColor" fillOpacity={0.25} />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M11.5 4.5l1.4-1.4M3.1 12.9l1.4-1.4" />
          </svg>
          <span className="text-[9px] leading-none tracking-[0.03em]">全开</span>
        </button>

        <button
          type="button"
          onClick={onAllOff}
          className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all duration-200"
          onMouseEnter={(e) => { e.currentTarget.style.background = chrome.hover }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          style={{ color: mutedColor, minWidth: 40 }}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
            <circle cx="8" cy="8" r="5" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
          </svg>
          <span className="text-[9px] leading-none tracking-[0.03em]">全关</span>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  Compass —— 南北仪表盘（DOM overlay，needle 由 CompassUpdater 每帧更新）
// ═══════════════════════════════════════════════════════════════════════════
//
// needleRef 传给 Canvas 内的 CompassUpdater，后者通过 useFrame 直接写
// CSS transform，无需 React re-render，完全跟手。

export const Compass = forwardRef<HTMLDivElement, { isNight: boolean }>(
  function Compass({ isNight }, needleRef) {
    const fg   = isNight ? 'rgba(220,228,240,0.92)' : 'rgba(25,35,55,0.88)'
    const bg   = isNight ? 'rgba(14,24,44,0.72)'    : 'rgba(255,255,255,0.76)'
    const ring = isNight ? 'rgba(180,200,230,0.18)'  : 'rgba(40,60,100,0.12)'

    return (
      <div
        className="pointer-events-none"
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          zIndex: 15,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: bg,
          border: `1px solid ${ring}`,
          backdropFilter: 'blur(12px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* 旋转指针（由 CompassUpdater 写入 transform） */}
        <div
          ref={needleRef}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width={28} height={28} viewBox="0 0 28 28" fill="none">
            {/* 北针（红）：指向 12 点钟 = 屏幕上方 = 计算得到的北向 */}
            <polygon points="14,2 11,14 14,12 17,14" fill="#ef4444" opacity={0.9} />
            {/* 南针（灰） */}
            <polygon points="14,26 11,14 14,16 17,14" fill={fg} opacity={0.45} />
          </svg>
        </div>
        {/* N 标签固定在指针组件外，始终在顶部 */}
        <span style={{
          position: 'absolute',
          top: 4,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: '#ef4444',
          lineHeight: 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}>N</span>
      </div>
    )
  }
)
