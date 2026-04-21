'use client'

import { useMemo, useState } from 'react'

type ThemeKey = 'white' | 'blue' | 'green' | 'purple'
type ToolKey = 'select' | 'floor' | 'wall' | 'door' | 'window' | 'furniture'

const THEMES: Record<
  ThemeKey,
  {
    label: string
    dayBg: string
    nightBg: string
    accent: string
    accentSoft: string
    tint: string
  }
> = {
  white: {
    label: 'White',
    dayBg: '#d3d8e0',
    nightBg: '#0c1b3d',
    accent: '#6b7280',
    accentSoft: 'rgba(107,114,128,0.18)',
    tint: '#ffffff',
  },
  blue: {
    label: 'Blue',
    dayBg: '#cfd6e0',
    nightBg: '#0d1b45',
    accent: '#3b82f6',
    accentSoft: 'rgba(59,130,246,0.2)',
    tint: '#79a8ff',
  },
  green: {
    label: 'Green',
    dayBg: '#d2d9df',
    nightBg: '#101f45',
    accent: '#7aa79a',
    accentSoft: 'rgba(122,167,154,0.2)',
    tint: '#9fd7c4',
  },
  purple: {
    label: 'Purple',
    dayBg: '#d4d6de',
    nightBg: '#291a4e',
    accent: '#8b73c9',
    accentSoft: 'rgba(139,115,201,0.22)',
    tint: '#c1a9f7',
  },
}

const TOOLS: Array<{ key: ToolKey; label: string }> = [
  { key: 'select', label: 'Select' },
  { key: 'floor', label: 'Floor' },
  { key: 'wall', label: 'Wall' },
  { key: 'door', label: 'Door' },
  { key: 'window', label: 'Window' },
  { key: 'furniture', label: 'Furniture' },
]

export default function UiWhothreeLabPage() {
  const [theme, setTheme] = useState<ThemeKey>('blue')
  const [night, setNight] = useState(false)
  const [activeTool, setActiveTool] = useState<ToolKey>('furniture')
  const [lights, setLights] = useState<Record<string, boolean>>({
    a: false,
    b: false,
    c: true,
    d: false,
    e: true,
    f: false,
    g: true,
    h: false,
  })

  const palette = THEMES[theme]
  const pageBg = night ? palette.nightBg : palette.dayBg
  const panelBg = night ? 'rgba(8,15,30,0.72)' : 'rgba(255,255,255,0.92)'
  const panelBorder = night ? 'rgba(120,142,178,0.3)' : 'rgba(148,163,184,0.26)'
  const textPrimary = night ? 'rgba(235,242,255,0.96)' : 'rgba(22,31,44,0.94)'
  const textMuted = night ? 'rgba(161,183,217,0.8)' : 'rgba(100,116,139,0.86)'

  const labels = useMemo(
    () => [
      { id: 'a', x: 26, y: 33 },
      { id: 'b', x: 37, y: 25 },
      { id: 'c', x: 48, y: 34 },
      { id: 'd', x: 58, y: 25 },
      { id: 'e', x: 52, y: 44 },
      { id: 'f', x: 40, y: 53 },
      { id: 'g', x: 63, y: 48 },
      { id: 'h', x: 57, y: 56 },
    ],
    []
  )

  return (
    <div className="relative h-screen w-screen overflow-hidden" style={{ background: pageBg }}>
      <div
        className="absolute inset-0"
        style={{
          background: night
            ? `radial-gradient(120% 120% at 70% 84%, ${palette.tint}14 0%, ${pageBg} 58%)`
            : `radial-gradient(110% 110% at 68% 84%, #ffffff55 0%, ${pageBg} 58%)`,
        }}
      />

      <aside className="absolute inset-y-0 left-0 z-20 w-20 border-r" style={{ background: panelBg, borderColor: panelBorder }}>
        <div className="flex flex-col items-center gap-2 p-2">
          {TOOLS.map((tool) => {
            const active = activeTool === tool.key
            return (
              <button
                key={tool.key}
                type="button"
                onClick={() => setActiveTool(tool.key)}
                className="h-16 w-16 rounded-2xl border text-[11px] font-medium transition-colors"
                style={{
                  borderColor: active ? palette.accent : panelBorder,
                  background: active ? palette.accentSoft : 'transparent',
                  color: active ? palette.accent : textMuted,
                  boxShadow: active ? '0 12px 24px rgba(37,99,235,0.12)' : 'none',
                }}
              >
                {tool.label}
              </button>
            )
          })}
        </div>
      </aside>

      <div className="absolute top-5 right-5 z-20 flex items-center gap-2">
        {['Account', 'AI', 'Grid', 'Shadow', 'Reflect', 'Top', 'Fit'].map((name) => (
          <button
            key={name}
            type="button"
            className="h-11 w-11 rounded-full border text-[10px]"
            title={name}
            style={{
              borderColor: panelBorder,
              background: panelBg,
              color: textMuted,
              boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
            }}
          >
            {name[0]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setNight((v) => !v)}
          className="h-11 w-11 rounded-full border text-[10px]"
          title="Toggle day or night"
          style={{
            borderColor: panelBorder,
            background: panelBg,
            color: textMuted,
            boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
          }}
        >
          {night ? 'M' : 'S'}
        </button>
      </div>

      <div className="absolute top-24 left-24 z-20 w-72 rounded-3xl border p-4" style={{ background: panelBg, borderColor: panelBorder }}>
        <div className="text-[10px] font-semibold tracking-[0.22em]" style={{ color: textMuted }}>
          ISOHOME 3D
        </div>
        <div className="mt-1 text-[11px] font-medium" style={{ color: palette.accent }}>
          Focused Room
        </div>
        <div className="mt-1 text-[33px] leading-[1.05] font-semibold" style={{ color: textPrimary }}>
          Hall, Primary Bedroom, Living Room
        </div>
      </div>

      <main className="absolute inset-0 pl-20">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <polygon points="22,28 56,22 74,45 40,55" fill={night ? '#dce6ff2b' : '#ffffff2e'} stroke={night ? '#f8fbff96' : '#ffffffb2'} strokeWidth="0.45" />
          <polygon points="22,28 22,64 40,85 40,55" fill={night ? '#c7d7ff22' : '#ffffff24'} stroke={night ? '#eff6ff66' : '#ffffff88'} strokeWidth="0.35" />
          <polygon points="40,55 74,45 74,73 40,85" fill={night ? '#d8e4ff20' : '#ffffff20'} stroke={night ? '#eff6ff66' : '#ffffff88'} strokeWidth="0.35" />

          <line x1="33" y1="24.5" x2="33" y2="60" stroke={night ? '#ecf3ff55' : '#ffffff70'} strokeWidth="0.3" />
          <line x1="45" y1="22.8" x2="45" y2="66.5" stroke={night ? '#ecf3ff55' : '#ffffff70'} strokeWidth="0.3" />
          <line x1="58" y1="25.3" x2="58" y2="71.5" stroke={night ? '#ecf3ff55' : '#ffffff70'} strokeWidth="0.3" />
          <line x1="67.8" y1="34" x2="67.8" y2="74.6" stroke={night ? '#ecf3ff55' : '#ffffff70'} strokeWidth="0.3" />
          <line x1="28" y1="38.5" x2="64" y2="32.5" stroke={night ? '#ecf3ff55' : '#ffffff70'} strokeWidth="0.3" />
          <line x1="27" y1="48.5" x2="69" y2="41.2" stroke={night ? '#ecf3ff55' : '#ffffff70'} strokeWidth="0.3" />
          <line x1="25.5" y1="58.5" x2="72.5" y2="49.5" stroke={night ? '#ecf3ff55' : '#ffffff70'} strokeWidth="0.3" />
        </svg>

        {labels.map((l) => {
          const on = lights[l.id]
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setLights((prev) => ({ ...prev, [l.id]: !prev[l.id] }))}
              className="absolute rounded-xl border px-2 py-1 text-left"
              style={{
                left: `${l.x}%`,
                top: `${l.y}%`,
                transform: 'translate(-50%,-50%)',
                borderColor: on ? '#facc15' : panelBorder,
                background: panelBg,
                boxShadow: on ? '0 8px 18px rgba(250,204,21,0.2)' : '0 6px 14px rgba(15,23,42,0.1)',
              }}
            >
              <div className="text-[11px] font-semibold" style={{ color: textPrimary }}>
                Light
              </div>
              <div className="text-[11px] font-medium" style={{ color: on ? '#eab308' : textMuted }}>
                {on ? 'On' : 'Off'}
              </div>
            </button>
          )
        })}

        <div className="absolute bottom-7 right-6 z-20 flex items-center gap-2">
          {(Object.keys(THEMES) as ThemeKey[]).map((k) => {
            const t = THEMES[k]
            const active = k === theme
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTheme(k)}
                className="h-8 w-8 rounded-full border transition-transform hover:scale-105"
                title={`Switch to ${t.label} theme`}
                style={{
                  background: `linear-gradient(145deg, ${t.dayBg}, ${t.tint})`,
                  borderColor: active ? '#ffffff' : 'rgba(255,255,255,0.74)',
                  boxShadow: active ? '0 0 0 2px rgba(30,41,59,0.45)' : '0 8px 18px rgba(15,23,42,0.12)',
                }}
              />
            )
          })}
        </div>
      </main>
    </div>
  )
}

