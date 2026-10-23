import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  BookOpen, CloudFog, CloudRain, Code2, Droplets, ExternalLink, Info, Leaf,
  Moon, Sun, Thermometer, TreePine, X, Zap,
} from 'lucide-react'
import { ERA5_PRECIP, ERA5_TMEAN, POWER_T2M_ANUAL } from './datosReales.js'

/* ───────────────────────── Datos simulados ───────────────────────── */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DECADAS = ['1990s', '2000s', '2010s', '2020s']
const ANIO_INICIO = 1990
const ANIO_FIN = 2025

// Climatología aproximada de Xalapa (°C): mes más frío ~14, más cálido ~18
const CLIMA_TEMP = [14.0, 14.8, 16.4, 17.6, 18.0, 17.6, 17.0, 17.1, 16.8, 15.9, 15.0, 14.2]
// Reparto de la lluvia anual por mes (temporada de lluvias jun–sep)
const REPARTO_LLUVIA = [3.5, 3.0, 3.0, 3.5, 6.5, 15.5, 13.0, 13.0, 18.0, 10.0, 6.0, 4.5]
const PROB_LLUVIA = [0.42, 0.38, 0.33, 0.35, 0.48, 0.72, 0.74, 0.73, 0.78, 0.62, 0.5, 0.45]
// Probabilidad diaria de niebla: máxima con los "nortes" (nov–feb)
const PROB_NIEBLA = [0.74, 0.7, 0.52, 0.4, 0.38, 0.5, 0.55, 0.55, 0.6, 0.64, 0.7, 0.75]

function mulberry32(semilla) {
  let a = semilla
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generarDatos(fuente = 'real') {
  const rnd = mulberry32(42)
  const normal = () => {
    const u = 1 - rnd()
    const v = rnd()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const sumaReparto = REPARTO_LLUVIA.reduce((a, b) => a + b, 0)
  const dias = []
  for (let anio = ANIO_INICIO; anio <= ANIO_FIN; anio++) {
    const t = anio - ANIO_INICIO
    // calentamiento que se acelera: ~+0.2 °C en los 90s hasta ~+1.3 °C en los 2020s
    const tendencia = 0.018 * t + 0.0006 * t * t
    const lluviaAnual = 1350 + 300 * rnd()
    const probExtremo = 0.02 + 0.0028 * t
    for (let mes = 0; mes < 12; mes++) {
      const nDias = new Date(anio, mes + 1, 0).getDate()
      const desvioMes = normal() * 0.35
      const crudo = []
      for (let d = 0; d < nDias; d++) {
        let mm = 0
        if (rnd() < PROB_LLUVIA[mes]) {
          mm = rnd() < probExtremo ? 25 - 40 * Math.log(1 - rnd()) : -6 * Math.log(1 - rnd())
        }
        crudo.push(mm)
      }
      const objetivo = (lluviaAnual * REPARTO_LLUVIA[mes]) / sumaReparto
      const total = crudo.reduce((a, b) => a + b, 0) || 1
      const escala = objetivo / total
      for (let d = 0; d < nDias; d++) {
        const precip = Math.round(crudo[d] * escala * 10) / 10
        const temp = CLIMA_TEMP[mes] + tendencia + desvioMes + normal() * 1.3
        let pNiebla = PROB_NIEBLA[mes] - 0.0045 * t + (precip > 1 ? 0.15 : 0)
        pNiebla = Math.min(0.97, Math.max(0.05, pNiebla))
        dias.push({
          fecha: `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`,
          anio,
          mes,
          decada: `${Math.floor(anio / 10) * 10}s`,
          temp: Math.round(temp * 10) / 10,
          precip,
          niebla: rnd() < pNiebla ? 1 : 0,
        })
      }
    }
  }
  if (fuente === 'real') {
    // Temperatura y lluvia reales de ERA5; la niebla sigue simulada (ERA5 no la reporta)
    dias.forEach((d, i) => {
      d.temp = ERA5_TMEAN[i]
      d.precip = ERA5_PRECIP[i]
    })
  }
  return dias
}

// Anomalía anual de cada fuente real contra su propio promedio 1990–2019
function compararFuentes() {
  const porAnio = new Map()
  ERA5_TMEAN.forEach((t, i) => {
    const fecha = new Date(Date.UTC(ANIO_INICIO, 0, 1 + i))
    const a = fecha.getUTCFullYear()
    if (!porAnio.has(a)) porAnio.set(a, [])
    porAnio.get(a).push(t)
  })
  const era5 = [...porAnio].map(([anio, ts]) => ({ anio, t: media(ts) }))
  const power = Object.entries(POWER_T2M_ANUAL).map(([anio, t]) => ({ anio: Number(anio), t }))
  const base = (xs) => media(xs.filter((x) => x.anio <= 2019).map((x) => x.t))
  const bE = base(era5)
  const bP = base(power)
  const filas = era5.map((e) => {
    const p = power.find((x) => x.anio === e.anio)
    return { anio: e.anio, era5: e.t - bE, power: p ? p.t - bP : null, era5Abs: e.t, powerAbs: p?.t ?? null }
  })
  const [mE] = polyfit1(era5.map((x) => x.anio), era5.map((x) => x.t))
  const [mP] = polyfit1(power.map((x) => x.anio), power.map((x) => x.t))
  return { filas, tendEra5: mE * 10, tendPower: mP * 10 }
}

/* ───────────────────────── Utilidades estadísticas ───────────────────────── */

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const cuantil = (xs, q) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const base = Math.floor(pos)
  return s[base] + (s[Math.min(base + 1, s.length - 1)] - s[base]) * (pos - base)
}
function pearson(xs, ys) {
  const mx = media(xs)
  const my = media(ys)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  return num / Math.sqrt(dx * dy || 1)
}
function polyfit1(xs, ys) {
  const mx = media(xs)
  const my = media(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const m = den ? num / den : 0
  return [m, my - m * mx]
}
const fmt = (n, d = 1) => n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })
const signo = (n, d = 2) => {
  const r = Math.round(n * 10 ** d) / 10 ** d || 0
  return `${r > 0 ? '+' : ''}${fmt(r, d)}`
}

const BINS = [1, 5, 10, 20, 30, 50, 75, 100, 200]
const ETIQUETAS_BINS = BINS.slice(0, -1).map((b, i) => (i === BINS.length - 2 ? `${b}+` : `${b}–${BINS[i + 1]}`))

/* ───────────────────────── Paletas ───────────────────────── */

// Validadas para daltonismo (orden fijo: el color sigue a la década, no a su posición)
const PALETA = {
  claro: {
    decadas: { '1990s': '#2f78c4', '2000s': '#d0702a', '2010s': '#8a52b8', '2020s': '#2e9160' },
    lluvia: '#2f78c4',
    niebla: '#d0702a',
    grid: '#e3e7e0',
    eje: '#7a847a',
    texto: '#4a554b',
    medio: '#f0efec',
    frio: ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab'],
    calido: ['#fbd5d0', '#f2a197', '#e0574d', '#a82a2a'],
  },
  oscuro: {
    decadas: { '1990s': '#3d86d6', '2000s': '#c96a24', '2010s': '#9a6fd6', '2020s': '#2f9a68' },
    lluvia: '#3d86d6',
    niebla: '#c96a24',
    grid: '#26302a',
    eje: '#8a968a',
    texto: '#bcc6bb',
    medio: '#383835',
    frio: ['#28405e', '#2a68b8', '#4f93e6', '#9ec5f4'],
    calido: ['#5a2b29', '#b33c38', '#e0605a', '#f6aea6'],
  },
}

const hexARgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function mezclar(a, b, t) {
  const [r1, g1, b1] = hexARgb(a)
  const [r2, g2, b2] = hexARgb(b)
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`
}
function colorAnomalia(v, pal, max = 2) {
  const t = Math.min(1, Math.abs(v) / max)
  const brazo = [pal.medio, ...(v < 0 ? pal.frio : pal.calido)]
  const pos = t * (brazo.length - 1)
  const i = Math.min(Math.floor(pos), brazo.length - 2)
  return mezclar(brazo[i], brazo[i + 1], pos - i)
}

/* ───────────────────────── Resaltado de Python ───────────────────────── */

const KW = new Set(['import', 'as', 'from', 'def', 'return', 'for', 'in', 'if', 'else', 'True', 'False', 'None', 'print', 'lambda', 'and', 'or', 'not'])
function resaltar(linea) {
  const partes = []
  const re = /(#.*$)|(f?"[^"]*"|f?'[^']*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)|(\s+)|([^\sA-Za-z_\d"'#]+)/g
  let m
  let k = 0
  while ((m = re.exec(linea))) {
    const [txt, com, str, num, id] = m
    let cls = 'text-[#d7dfd4]'
    if (com) cls = 'text-[#7f8f80] italic'
    else if (str) cls = 'text-[#e6b673]'
    else if (num) cls = 'text-[#f29b8a]'
    else if (id && KW.has(id)) cls = 'text-[#c39ce8]'
    else if (id && (id === 'pd' || id === 'np' || id === 'df')) cls = 'text-[#8fc6f5]'
    else if (id && linea[m.index + txt.length] === '(') cls = 'text-[#a7d47b]'
    partes.push(<span key={k++} className={cls}>{txt}</span>)
  }
  return partes
}

function Editor({ codigo, titulo = 'notebook.py' }) {
  const lineas = codigo.trim().split('\n')
  return (
    <div className="rounded-xl overflow-hidden border border-[#2a352d] bg-code shadow-inner">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1c2620] border-b border-[#2a352d]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#e0605a]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#e6b673]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#7fbf6a]" />
        <span className="ml-2 font-mono text-[11px] text-[#8a968a]">{titulo}</span>
      </div>
      <pre className="scroll-fino overflow-x-auto p-3 text-[12px] leading-[1.6] font-mono">
        {lineas.map((l, i) => (
          <div key={i} className="flex">
            <span className="select-none w-7 shrink-0 text-right pr-3 text-[#4b5a4e]">{i + 1}</span>
            <span className="whitespace-pre">{resaltar(l)}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}

function Salida({ children, etiqueta = 'Out' }) {
  return (
    <div className="rounded-xl border border-[#2a352d] bg-[#0f1511] font-mono text-[12px] text-[#cfd8cc]">
      <div className="px-3 pt-2 text-[11px] text-[#7fbf6a]">{etiqueta} ▸ con tus filtros actuales</div>
      <div className="scroll-fino overflow-x-auto p-3 pt-1.5 whitespace-pre leading-[1.55]">{children}</div>
    </div>
  )
}

/* ───────────────────────── Componentes de UI ───────────────────────── */

function Tarjeta({ titulo, subtitulo, icono: Icono, onInfo, acciones, children }) {
  return (
    <section className="bg-card border border-line rounded-2xl p-4 sm:p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <header className="flex flex-wrap items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-mossSoft text-moss grid place-items-center shrink-0">
          <Icono size={18} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <h2 className="font-display text-[19px] leading-tight text-ink">{titulo}</h2>
          <p className="text-[13px] text-ink2 mt-0.5">{subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          {acciones}
          <button
            onClick={onInfo}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-moss hover:bg-mossSoft transition"
          >
            <Info size={14} /> ¿Cómo se hizo?
          </button>
        </div>
      </header>
      {children}
    </section>
  )
}

function Segmentado({ opciones, valor, onCambio }) {
  return (
    <div className="inline-flex rounded-full border border-line p-0.5 bg-bg">
      {opciones.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onCambio(v)}
          className={`px-3 py-1 rounded-full text-[12px] font-medium transition ${valor === v ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function CajaTooltip({ titulo, filas }) {
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 shadow-lg text-[12px] min-w-[170px]">
      <div className="font-semibold text-ink mb-1">{titulo}</div>
      {filas.map(([color, etiqueta, valor], i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          {color && <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />}
          <span className="text-ink2 flex-1">{etiqueta}</span>
          <span className="font-mono text-ink tabular-nums">{valor}</span>
        </div>
      ))}
    </div>
  )
}

function Kpi({ icono: Icono, etiqueta, valor, unidad, nota }) {
  return (
    <div className="bg-card border border-line rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[12px] text-ink2">
        <Icono size={14} className="text-moss" /> {etiqueta}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="font-display text-[28px] leading-none text-ink tabular-nums">{valor}</span>
        <span className="text-[13px] text-ink2">{unidad}</span>
      </div>
      <div className="text-[12px] text-muted mt-1">{nota}</div>
    </div>
  )
}

/* ───────────────────────── Mapa de calor ───────────────────────── */

function MapaCalor({ filas, pal }) {
  const [hover, setHover] = useState(null)
  const caja = useRef(null)
  const mover = (e, info) => {
    const r = caja.current.getBoundingClientRect()
    setHover({ ...info, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width })
  }
  return (
    <div ref={caja} className="relative" onMouseLeave={() => setHover(null)}>
      <div className="scroll-fino overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: '44px repeat(12, minmax(0,1fr)) 10px 56px' }}>
            <div />
            {MESES.map((m) => (
              <div key={m} className="text-[11px] text-muted text-center pb-1">{m}</div>
            ))}
            <div />
            <div className="text-[11px] text-muted text-center pb-1">Anual</div>
            {filas.map((f) => (
              <FilaCalor key={f.anio} f={f} pal={pal} mover={mover} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-4 text-[11px] text-ink2">
        <span>Anomalía vs. normal 1990–2019</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono">−2 °C</span>
          <div
            className="h-2.5 w-44 rounded-full"
            style={{ background: `linear-gradient(90deg, ${[-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((v) => colorAnomalia(v, pal)).join(',')})` }}
          />
          <span className="font-mono">+2 °C</span>
        </div>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-10"
          style={{ left: Math.min(hover.x + 14, hover.w - 190), top: hover.y + 14 }}
        >
          <CajaTooltip
            titulo={hover.titulo}
            filas={[
              [hover.color, 'Anomalía', `${signo(hover.anomalia)} °C`],
              [null, 'Temp. media', `${fmt(hover.temp)} °C`],
              [null, 'Normal del mes', `${fmt(hover.normal)} °C`],
            ]}
          />
        </div>
      )}
    </div>
  )
}

function FilaCalor({ f, pal, mover }) {
  return (
    <>
      <div className="text-[11px] text-ink2 font-mono flex items-center">{f.anio}</div>
      {f.meses.map((c, i) => {
        const color = colorAnomalia(c.anomalia, pal)
        return (
          <div
            key={i}
            className="h-[18px] rounded-[3px] hover:ring-2 hover:ring-ink/60 transition"
            style={{ background: color }}
            onMouseMove={(e) => mover(e, { titulo: `${MESES[i]} ${f.anio}`, color, ...c })}
          />
        )
      })}
      <div />
      <div
        className="h-[18px] rounded-[3px] text-[10px] font-mono grid place-items-center text-ink"
        style={{ background: colorAnomalia(f.anual, pal) }}
        onMouseMove={(e) => mover(e, { titulo: `Promedio ${f.anio}`, color: colorAnomalia(f.anual, pal), anomalia: f.anual, temp: f.tempAnual, normal: f.tempAnual - f.anual })}
      >
        <span className="px-1 rounded bg-card/70">{signo(f.anual, 1)}</span>
      </div>
    </>
  )
}

/* ───────────────────────── Dos fuentes reales ───────────────────────── */

function ComparaFuentes({ c, pal, ejes }) {
  return (
    <div className="mt-6 pt-5 border-t border-line">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1">
        <h3 className="font-display text-[16px] text-ink">¿Se está calentando? Dos fuentes reales</h3>
        <span className="text-[12px] text-ink2">Anomalía anual contra el promedio 1990–2019 de cada fuente</span>
      </div>
      <div className="flex flex-wrap gap-2 my-3">
        {[
          [pal.lluvia, 'ERA5 · Open-Meteo (1405 m)', c.tendEra5],
          [pal.niebla, 'NASA POWER (1133 m)', c.tendPower],
        ].map(([color, nombre, t]) => (
          <div key={nombre} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-ink2">{nombre}</span>
            <span className="font-mono text-ink tabular-nums">{signo(t)} °C/década</span>
          </div>
        ))}
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={c.filas} margin={{ top: 4, right: 18, left: -4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={pal.grid} />
            <XAxis dataKey="anio" {...ejes} ticks={[1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025]} />
            <YAxis {...ejes} width={56} domain={[-1, 2]} ticks={[-1, 0, 1, 2]} tickFormatter={(v) => `${v > 0 ? '+' : ''}${v} °C`} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <CajaTooltip
                    titulo={label}
                    filas={[
                      [pal.lluvia, 'ERA5', `${signo(payload[0].payload.era5)} °C · ${fmt(payload[0].payload.era5Abs)} °C`],
                      ...(payload[0].payload.power != null ? [[pal.niebla, 'NASA POWER', `${signo(payload[0].payload.power)} °C · ${fmt(payload[0].payload.powerAbs)} °C`]] : []),
                    ]}
                  />
                ) : null
              }
            />
            <Line dataKey="era5" name="ERA5" stroke={pal.lluvia} strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            <Line dataKey="power" name="NASA POWER" stroke={pal.niebla} strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[12px] text-muted mt-2 max-w-3xl">
        Las dos son estimaciones en malla (no una estación en Xalapa) y no coinciden: POWER marca un calentamiento claro y ERA5 casi plano en esta celda. Para una conclusión firme habría que
        contrastarlas con las estaciones del SMN/CONAGUA.
      </p>
    </div>
  )
}

/* ───────────────────────── Violín (SVG propio) ───────────────────────── */

function Violin({ grupos, umbral, pal }) {
  const [hover, setHover] = useState(null)
  const W = 640
  const H = 300
  const m = { t: 12, r: 12, b: 34, l: 44 }
  const yMax = 160
  const y = (v) => m.t + (H - m.t - m.b) * (1 - Math.min(v, yMax) / yMax)
  const banda = (W - m.l - m.r) / Math.max(grupos.length, 1)
  const puntos = Array.from({ length: 64 }, (_, i) => (i / 63) * yMax)
  const formas = grupos.map((g) => {
    const xs = g.valores
    const sd = Math.sqrt(media(xs.map((v) => (v - media(xs)) ** 2))) || 1
    const bw = 1.06 * sd * Math.pow(xs.length || 1, -0.2)
    const dens = puntos.map((p) => {
      let s = 0
      for (const v of xs) s += Math.exp(-0.5 * ((p - v) / bw) ** 2)
      return s / ((xs.length || 1) * bw * Math.sqrt(2 * Math.PI))
    })
    return { ...g, dens, max: Math.max(...dens, 1e-9) }
  })
  const maxGlobal = Math.max(...formas.map((f) => f.max))
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Diagrama de violín de la lluvia diaria por década">
        {[0, 40, 80, 120, 160].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={pal.grid} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={pal.eje}>{v}</text>
          </g>
        ))}
        <text x={m.l - 8} y={H - 12} textAnchor="end" fontSize="11" fill={pal.eje}>mm</text>
        <line x1={m.l} x2={W - m.r} y1={y(umbral)} y2={y(umbral)} stroke={pal.niebla} strokeWidth="2" strokeDasharray="5 4" />
        <text x={m.l + 4} y={y(umbral) - 6} fontSize="11" fill={pal.texto}>umbral {umbral} mm</text>
        {formas.map((f, gi) => {
          const cx = m.l + banda * (gi + 0.5)
          const ancho = banda * 0.42
          const der = f.dens.map((d, i) => `${cx + (d / maxGlobal) * ancho},${y(puntos[i])}`)
          const izq = f.dens.map((d, i) => `${cx - (d / maxGlobal) * ancho},${y(puntos[i])}`).reverse()
          const color = pal.decadas[f.decada]
          return (
            <g
              key={f.decada}
              onMouseMove={() => setHover({ ...f, cx: (cx / W) * 100 })}
              className="cursor-default"
            >
              <rect x={cx - banda / 2} y={m.t} width={banda} height={H - m.t - m.b} fill="transparent" />
              <polygon points={[...der, ...izq].join(' ')} fill={color} fillOpacity={hover?.decada === f.decada ? 0.55 : 0.32} stroke={color} strokeWidth="2" />
              <rect x={cx - 4} y={y(f.q3)} width="8" height={Math.max(2, y(f.q1) - y(f.q3))} rx="3" fill={color} stroke={pal.medio} strokeWidth="2" />
              <circle cx={cx} cy={y(f.mediana)} r="4" fill={pal.medio} stroke={color} strokeWidth="2" />
              {f.extremos.map((v, i) => (
                <circle key={i} cx={cx + ((i * 37) % 19) - 9} cy={y(v)} r="2.2" fill={color} opacity="0.8" />
              ))}
              <text x={cx} y={H - 12} textAnchor="middle" fontSize="12" fill={pal.texto}>{f.decada}</text>
            </g>
          )
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute top-2 z-10" style={{ left: `clamp(0px, calc(${hover.cx}% - 90px), calc(100% - 200px))` }}>
          <CajaTooltip
            titulo={`Década ${hover.decada}`}
            filas={[
              [pal.decadas[hover.decada], 'Días con lluvia', fmt(hover.valores.length, 0)],
              [null, 'Mediana', `${fmt(hover.mediana)} mm`],
              [null, 'Percentil 95', `${fmt(hover.p95)} mm`],
              [null, `Eventos > ${umbral} mm`, fmt(hover.extremos.length, 0)],
              [null, 'Máximo', `${fmt(hover.maximo)} mm`],
            ]}
          />
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Modo aprendizaje ───────────────────────── */

function PanelAprendizaje({ abierto, tab, setTab, onCerrar, st }) {
  const tabs = [
    ['datos', 'El DataFrame'],
    ['calor', 'Mapa de calor'],
    ['doble', 'Doble eje'],
    ['lluvia', 'Lluvias extremas'],
  ]
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-30 transition-opacity lg:hidden ${abierto ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onCerrar}
      />
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[520px] z-40 bg-[#121915] text-[#dfe6dc] border-l border-[#2a352d] shadow-2xl transition-transform duration-300 flex flex-col ${abierto ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!abierto}
      >
        <div className="px-5 pt-5 pb-3 border-b border-[#2a352d]">
          <div className="flex items-center gap-2">
            <Code2 size={18} className="text-[#a7d47b]" />
            <h2 className="font-display text-[20px] flex-1">¿Cómo se hizo en Pandas?</h2>
            <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Cerrar panel">
              <X size={18} />
            </button>
          </div>
          <p className="text-[12.5px] text-[#9eab9d] mt-1">
            Cada gráfica sale de unas cuantas líneas de Pandas y NumPy. Los resultados de abajo se recalculan con los filtros que tengas activos.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tabs.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1 rounded-full text-[12px] font-medium border transition ${tab === k ? 'bg-[#a7d47b] text-[#121915] border-[#a7d47b]' : 'border-[#2f3b32] text-[#b9c4b7] hover:border-[#a7d47b]'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="scroll-fino flex-1 overflow-y-auto px-5 py-4 space-y-4 text-[13.5px] leading-relaxed">
          {tab === 'datos' && <LeccionDatos st={st} />}
          {tab === 'calor' && <LeccionCalor st={st} />}
          {tab === 'doble' && <LeccionDoble st={st} />}
          {tab === 'lluvia' && <LeccionLluvia st={st} />}
        </div>
      </aside>
    </>
  )
}

function Paso({ n, titulo, children }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-[#2a3a2c] text-[#a7d47b] text-[12px] font-mono grid place-items-center shrink-0 mt-0.5">{n}</div>
      <div>
        <div className="font-semibold text-[#eef3ea]">{titulo}</div>
        <div className="text-[#b9c4b7]">{children}</div>
      </div>
    </div>
  )
}

const C = ({ children }) => <code className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-[#1f2a22] text-[#a7d47b]">{children}</code>

function LeccionDatos({ st }) {
  const cab = st.head
  return (
    <>
      <p className="text-[#b9c4b7]">
        Todo empieza con un <strong className="text-[#eef3ea]">DataFrame diario</strong>: una fila por día de {ANIO_INICIO} a {ANIO_FIN} ({fmt(st.totalDias, 0)} filas con tus filtros).{' '}
        {st.fuente === 'real'
          ? 'Temperatura y lluvia vienen del reanálisis ERA5 (descargado de Open-Meteo como CSV). La niebla no la mide ERA5, así que se simula con NumPy.'
          : 'En este modo todo está simulado con NumPy a partir de la climatología típica de Xalapa, con tendencia de calentamiento y menos niebla con los años.'}
      </p>
      {st.fuente === 'real' && (
        <Editor
          titulo="01_datos_reales.py"
          codigo={`
import numpy as np
import pandas as pd

# CSV descargado de la API de Open-Meteo (ERA5), celda 19.51, -96.97
df = pd.read_csv("era5_xalapa_diario.csv",
                 parse_dates=["fecha"], index_col="fecha")
df = df.rename(columns={"tmean": "temp"})[["temp", "precip"]]

df["anio"] = df.index.year
df["mes"] = df.index.month
df["decada"] = (df["anio"] // 10 * 10).astype(str) + "s"

# ERA5 no trae niebla: la simulamos (1 = día con niebla)
rng = np.random.default_rng(seed=42)
df["niebla"] = (rng.random(len(df)) < prob_niebla[df["mes"] - 1]).astype(int)

df.info()        # 13,149 filas, sin nulos
df.head()`}
        />
      )}
      {st.fuente === 'sim' && <Editor
        titulo="01_datos.py"
        codigo={`
import numpy as np
import pandas as pd

rng = np.random.default_rng(seed=42)
fechas = pd.date_range("1990-01-01", "2025-12-31", freq="D")
df = pd.DataFrame(index=fechas)
df["anio"] = df.index.year
df["mes"] = df.index.month
df["decada"] = (df["anio"] // 10 * 10).astype(str) + "s"

# Temperatura = climatología del mes + tendencia + ruido gaussiano
clima = np.array([14.0, 14.8, 16.4, 17.6, 18.0, 17.6,
                  17.0, 17.1, 16.8, 15.9, 15.0, 14.2])
t = df["anio"] - 1990
tendencia = 0.018 * t + 0.0006 * t**2
df["temp"] = clima[df["mes"] - 1] + tendencia + rng.normal(0, 1.3, len(df))

# Lluvia: días húmedos con montos exponenciales (cola pesada)
llueve = rng.random(len(df)) < prob_lluvia[df["mes"] - 1]
df["precip"] = np.where(llueve, rng.exponential(6, len(df)), 0.0)

# Niebla: variable booleana (1 = hubo niebla ese día)
df["niebla"] = (rng.random(len(df)) < prob_niebla[df["mes"] - 1]).astype(int)
df.head()`}
      />}
      <Salida>
        {`            anio  mes decada  temp  precip  niebla\n`}
        {cab.map((d) => `${d.fecha}  ${d.anio}  ${String(d.mes + 1).padStart(3)}  ${d.decada}  ${d.temp.toFixed(1).padStart(4)}  ${d.precip.toFixed(1).padStart(6)}  ${String(d.niebla).padStart(6)}`).join('\n')}
      </Salida>
      <Paso n="1" titulo="Índice de fechas">
        Usar <C>pd.date_range</C> como índice convierte al DataFrame en una <em>serie de tiempo</em>: así funcionan <C>resample()</C>, <C>.dt</C> y los cortes por fecha.
      </Paso>
      <Paso n="2" titulo="Vectorizar con NumPy">
        <C>clima[df["mes"] - 1]</C> no usa ningún <C>for</C>: NumPy indexa el arreglo con toda la columna a la vez. Es la diferencia entre segundos y milisegundos.
      </Paso>
      <Paso n="3" titulo="Filtrar por década">
        Los botones de década equivalen a <C>{`df[df["decada"].isin(${JSON.stringify(st.decadas)})]`}</C>.
      </Paso>
    </>
  )
}

function LeccionCalor({ st }) {
  return (
    <>
      <p className="text-[#b9c4b7]">
        Una <strong className="text-[#eef3ea]">anomalía térmica</strong> es cuánto se aleja un mes de su “normal”. Comparamos cada mes contra el promedio de ese mismo mes en 1990–2019
        (30 años, como recomienda la OMM), así quitamos el ciclo estacional y queda solo el cambio.
      </p>
      <Editor
        titulo="02_mapa_calor.py"
        codigo={`
# 1) Temperatura media de cada año-mes
mensual = df.groupby(["anio", "mes"])["temp"].mean().reset_index()

# 2) Normal climatológica: promedio por mes en 1990–2019
base = mensual[mensual["anio"].between(1990, 2019)]
normal = base.groupby("mes")["temp"].mean()

# 3) Anomalía = valor observado - normal de su mes
mensual["anomalia"] = mensual["temp"] - mensual["mes"].map(normal)

# 4) Tabla dinámica: años en filas, meses en columnas
heat = mensual.pivot_table(index="anio", columns="mes",
                           values="anomalia", aggfunc="mean")

# 5) Promedio anual y tendencia lineal con NumPy
anual = heat.mean(axis=1)
pendiente, intercepto = np.polyfit(anual.index, anual.values, deg=1)
print(f"Tendencia: {pendiente * 10:+.2f} °C por década")`}
      />
      <Salida>
        {`normal (°C):\n`}
        {MESES.map((m, i) => `  ${m}  ${st.normal[i].toFixed(2)}`).join('\n')}
        {`\n\nanual.tail(3):\n`}
        {st.anualAnom.slice(-3).map((a) => `  ${a.anio}   ${signo(a.anual, 3)}`).join('\n')}
        {`\n\nTendencia: ${signo(st.pendiente * 10, 2)} °C por década`}
        {st.fuente === 'real' ? `\n\n# misma cuenta, 1990–2025, sin filtros\nERA5        ${signo(st.comparacion.tendEra5, 2)} °C/década\nNASA POWER  ${signo(st.comparacion.tendPower, 2)} °C/década  (1990–2024)` : ''}
      </Salida>
      <Paso n="1" titulo="groupby vs pivot_table">
        <C>groupby</C> produce una tabla “larga” (una fila por año-mes). <C>pivot_table</C> la vuelve “ancha”: exactamente la forma de la cuadrícula del mapa de calor.
      </Paso>
      <Paso n="2" titulo=".map(normal)">
        <C>normal</C> es una Serie indexada por mes; <C>.map()</C> busca la normal de cada fila sin hacer un <C>merge</C>.
      </Paso>
      <Paso n="3" titulo="np.polyfit">
        Ajusta una recta por mínimos cuadrados. La pendiente (°C/año × 10) resume en un número cuánto se calienta el bosque por década.
      </Paso>
      <Paso n="4" titulo="Compara fuentes antes de concluir">
        ERA5 y NASA POWER son reanálisis en malla: cada celda promedia decenas de kilómetros y una altitud distinta (1405 m vs. 1133 m). Por eso su temperatura absoluta y su tendencia
        difieren. Comparar anomalías (cada una contra su propia normal) en lugar de valores absolutos es la forma justa de ponerlas lado a lado.
      </Paso>
    </>
  )
}

function LeccionDoble({ st }) {
  return (
    <>
      <p className="text-[#b9c4b7]">
        Lluvia y niebla viven en escalas distintas (milímetros vs. días), por eso la gráfica usa <strong className="text-[#eef3ea]">dos ejes Y</strong>. Antes de graficar hay que
        llevar el dato diario a frecuencia mensual con <C>resample</C>.
      </p>
      <Editor
        titulo="03_doble_eje.py"
        codigo={`
# resample agrupa por ventanas de tiempo usando el índice de fechas
# 'MS' = inicio de mes ('M'/'ME' = fin de mes; 'M' está obsoleto en pandas 2.2+)
temp_mes = df["temp"].resample("MS").mean()       # temperatura: promedio
mensual = df.resample("MS").agg({
    "precip": "sum",      # lluvia: se SUMA (mm acumulados en el mes)
    "niebla": "sum",      # niebla: se suman los días con 1
})

# Ciclo anual promedio (lo que ves en la gráfica)
ciclo = mensual.groupby(mensual.index.month).mean()

# ¿Llueve más cuando hay más niebla? Correlación de Pearson
mensual[["precip", "niebla"]].corr()

# Gráfica de doble eje con matplotlib
fig, ax1 = plt.subplots()
ax1.bar(ciclo.index, ciclo["precip"], color="#2f78c4")
ax2 = ax1.twinx()                        # segundo eje Y
ax2.plot(ciclo.index, ciclo["niebla"], color="#d0702a")`}
      />
      <Salida>
        {`          precip   niebla\nprecip    1.000    ${st.r.toFixed(3)}\nniebla    ${st.r.toFixed(3)}    1.000\n\n`}
        {`Lluvia anual promedio: ${fmt(st.lluviaAnual, 0)} mm\nDías de niebla al año: ${fmt(st.nieblaAnual, 0)}`}
      </Salida>
      <Paso n="1" titulo="mean() o sum()">
        La temperatura se <em>promedia</em> pero la lluvia se <em>acumula</em>: <C>resample("M").mean()</C> sobre la lluvia daría mm por día, no mm por mes. Elegir la agregación correcta es la mitad del análisis.
      </Paso>
      <Paso n="2" titulo="Leer la correlación">
        r = {st.r.toFixed(2)}: {Math.abs(st.r) < 0.3 ? 'relación débil' : Math.abs(st.r) < 0.6 ? 'relación moderada' : 'relación fuerte'}
        {st.r >= 0 ? ' y positiva' : ' y negativa'}. En el bosque de niebla buena parte del agua llega como niebla en temporada seca (los “nortes”), cuando casi no llueve: por eso la relación
        no es tan simple como “más lluvia, más niebla”.
      </Paso>
      <Paso n="3" titulo="Cuidado con el doble eje">
        Cada eje tiene su propia escala, así que el cruce de las curvas no significa nada. Usa el botón <em>Separadas</em> para ver ambas series en paneles independientes y compáralas sin esa trampa visual.
      </Paso>
    </>
  )
}

function LeccionLluvia({ st }) {
  return (
    <>
      <p className="text-[#b9c4b7]">
        Un evento extremo es un día cuya lluvia supera un <strong className="text-[#eef3ea]">umbral</strong>. Con máscaras booleanas filtramos esos días y con <C>pd.cut</C> los repartimos en
        rangos para contar cuántos caen en cada uno.
      </p>
      <Editor
        titulo="04_lluvias_extremas.py"
        codigo={`
umbral = ${st.umbral}  # mm/día (mueve el control deslizante)

# Máscara booleana: True donde se cumple la condición
lluviosos = df[df["precip"] >= 1.0]
extremos = df[df["precip"] > umbral]

# Umbral estadístico alternativo: percentil 95
p95 = np.percentile(lluviosos["precip"], 95)

# Rangos con pd.cut (right=False → [1, 5), [5, 10), ...)
bins = [1, 5, 10, 20, 30, 50, 75, 100, 200]
lluviosos["rango"] = pd.cut(lluviosos["precip"], bins=bins, right=False)

# Conteo por década y rango, normalizado por años de cada década
anios = df.groupby("decada")["anio"].nunique()
tabla = (lluviosos.groupby(["decada", "rango"], observed=True)
                  .size().unstack(fill_value=0)
                  .div(anios, axis=0))

extremos.groupby("decada").size() / anios`}
      />
      <Salida>
        {`p95 = ${st.p95.toFixed(1)} mm\n\nEventos > ${st.umbral} mm por año:\n`}
        {st.extPorDecada.map((e) => `  ${e.decada}   ${e.porAnio.toFixed(2)}   (${e.n} eventos en ${e.anios} años)`).join('\n')}
      </Salida>
      <Paso n="1" titulo="Máscaras booleanas">
        <C>{'df["precip"] > umbral'}</C> devuelve una Serie de True/False del mismo largo que <C>df</C>; al usarla entre corchetes solo quedan las filas True. Se combinan con <C>&</C> y <C>|</C>, siempre entre paréntesis.
      </Paso>
      <Paso n="2" titulo="Normalizar antes de comparar">
        La década de 2020 solo tiene {st.anios2020} años de datos. Dividir entre <C>nunique()</C> de años convierte conteos en <em>eventos por año</em> y hace justa la comparación.
      </Paso>
      <Paso n="3" titulo="Histograma vs. violín">
        El histograma muestra conteos por rango; el violín estima la densidad completa (KDE, como <C>seaborn.violinplot</C>) y deja ver la cola larga de los extremos.
      </Paso>
    </>
  )
}

/* ───────────────────────── App ───────────────────────── */

export default function BosqueNiebla() {
  const [fuente, setFuente] = useState('real')
  const datos = useMemo(() => generarDatos(fuente), [fuente])
  const comparacion = useMemo(compararFuentes, [])
  const [oscuro, setOscuro] = useState(() => {
    try {
      const g = localStorage.getItem('bn-tema')
      if (g) return g === 'oscuro'
    } catch {}
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  })
  const [decadas, setDecadas] = useState(DECADAS)
  const [panel, setPanel] = useState(false)
  const [tab, setTab] = useState('datos')
  const [vistaDoble, setVistaDoble] = useState('doble')
  const [vistaLluvia, setVistaLluvia] = useState('hist')
  const [umbral, setUmbral] = useState(40)
  const pal = oscuro ? PALETA.oscuro : PALETA.claro

  useEffect(() => {
    try { localStorage.setItem('bn-tema', oscuro ? 'oscuro' : 'claro') } catch {}
    document.body.style.background = oscuro ? '#111713' : '#eef1ec'
  }, [oscuro])

  const alternarDecada = (d) =>
    setDecadas((prev) => {
      if (prev.includes(d)) return prev.length === 1 ? prev : prev.filter((x) => x !== d)
      return DECADAS.filter((x) => x === d || prev.includes(x))
    })

  const abrirInfo = (t) => {
    setTab(t)
    setPanel(true)
  }

  // Agregados base (todos los años): equivalen a groupby(["anio","mes"])
  const mensualTodo = useMemo(() => {
    const mapa = new Map()
    for (const d of datos) {
      const k = d.anio * 12 + d.mes
      let r = mapa.get(k)
      if (!r) {
        r = { anio: d.anio, mes: d.mes, decada: d.decada, sumaT: 0, n: 0, precip: 0, niebla: 0 }
        mapa.set(k, r)
      }
      r.sumaT += d.temp
      r.n += 1
      r.precip += d.precip
      r.niebla += d.niebla
    }
    const filas = [...mapa.values()].map((r) => ({ ...r, temp: r.sumaT / r.n }))
    const normal = MESES.map((_, m) => media(filas.filter((f) => f.mes === m && f.anio <= 2019).map((f) => f.temp)))
    filas.forEach((f) => { f.anomalia = f.temp - normal[f.mes] })
    return { filas, normal }
  }, [datos])

  const st = useMemo(() => {
    const sel = new Set(decadas)
    const dias = datos.filter((d) => sel.has(d.decada))
    const mensual = mensualTodo.filas.filter((f) => sel.has(f.decada))
    const anios = [...new Set(mensual.map((f) => f.anio))]
    const nAnios = anios.length

    const calor = anios.map((anio) => {
      const meses = mensual.filter((f) => f.anio === anio).sort((a, b) => a.mes - b.mes)
      return {
        anio,
        meses: meses.map((f) => ({ anomalia: f.anomalia, temp: f.temp, normal: mensualTodo.normal[f.mes] })),
        anual: media(meses.map((f) => f.anomalia)),
        tempAnual: media(meses.map((f) => f.temp)),
      }
    })
    const [pendiente] = polyfit1(calor.map((c) => c.anio), calor.map((c) => c.anual))

    const ciclo = MESES.map((m, i) => {
      const fs = mensual.filter((f) => f.mes === i)
      return { mes: m, precip: media(fs.map((f) => f.precip)), niebla: media(fs.map((f) => f.niebla)) }
    })
    const porDecadaCiclo = MESES.map((m, i) => {
      const fila = { mes: m }
      for (const d of decadas) fila[d] = media(mensualTodo.filas.filter((f) => f.decada === d && f.mes === i).map((f) => f.niebla))
      return fila
    })

    const lluviosos = dias.filter((d) => d.precip >= 1)
    const aniosDe = (d) => new Set(datos.filter((x) => x.decada === d).map((x) => x.anio)).size
    const hist = ETIQUETAS_BINS.map((etiqueta, i) => {
      const fila = { rango: etiqueta, desde: BINS[i], hasta: BINS[i + 1] }
      for (const d of decadas) {
        const n = lluviosos.filter((x) => x.decada === d && x.precip >= BINS[i] && x.precip < BINS[i + 1]).length
        fila[d] = n / aniosDe(d)
      }
      return fila
    })
    const grupos = decadas.map((d) => {
      const valores = lluviosos.filter((x) => x.decada === d).map((x) => x.precip)
      return {
        decada: d,
        valores,
        mediana: cuantil(valores, 0.5),
        q1: cuantil(valores, 0.25),
        q3: cuantil(valores, 0.75),
        p95: cuantil(valores, 0.95),
        maximo: Math.max(...valores, 0),
        extremos: valores.filter((v) => v > umbral),
      }
    })
    const extPorDecada = decadas.map((d) => {
      const n = lluviosos.filter((x) => x.decada === d && x.precip > umbral).length
      const a = aniosDe(d)
      return { decada: d, n, anios: a, porAnio: n / a }
    })

    return {
      decadas,
      fuente,
      comparacion,
      totalDias: dias.length,
      head: dias.slice(0, 5),
      normal: mensualTodo.normal,
      calor,
      anualAnom: calor,
      pendiente,
      ciclo,
      porDecadaCiclo,
      r: pearson(mensual.map((f) => f.precip), mensual.map((f) => f.niebla)),
      lluviaAnual: mensual.reduce((a, f) => a + f.precip, 0) / nAnios,
      nieblaAnual: mensual.reduce((a, f) => a + f.niebla, 0) / nAnios,
      tempMedia: media(mensual.map((f) => f.temp)),
      anomMedia: media(mensual.map((f) => f.anomalia)),
      hist,
      grupos,
      extPorDecada,
      extremosAnio: lluviosos.filter((x) => x.precip > umbral).length / nAnios,
      p95: cuantil(lluviosos.map((x) => x.precip), 0.95),
      umbral,
      anios2020: aniosDe('2020s'),
    }
  }, [datos, mensualTodo, decadas, umbral, fuente, comparacion])

  const ejes = { stroke: pal.eje, fontSize: 11, tickLine: false, axisLine: { stroke: pal.grid } }

  return (
    <div className={`${oscuro ? 'tema-oscuro' : 'tema-claro'} min-h-screen bg-bg text-ink font-sans`}>
      {/* Cabecera con silueta de bosque y niebla */}
      <header className="relative overflow-hidden border-b border-line">
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1200 260" aria-hidden="true">
          <defs>
            <linearGradient id="cielo" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={oscuro ? '#16211a' : '#dfe6dc'} />
              <stop offset="1" stopColor={oscuro ? '#111713' : '#eef1ec'} />
            </linearGradient>
          </defs>
          <rect width="1200" height="260" fill="url(#cielo)" />
          <path d="M0 190 L80 150 L150 175 L240 120 L330 168 L420 132 L520 176 L610 128 L700 170 L800 118 L900 160 L1000 126 L1100 170 L1200 140 L1200 260 L0 260Z" fill={oscuro ? '#1d2a20' : '#c9d4c2'} opacity="0.9" />
          <path d="M0 215 L60 185 L120 205 L200 170 L280 208 L360 178 L450 212 L540 176 L630 210 L720 182 L820 214 L910 180 L1010 212 L1100 186 L1200 206 L1200 260 L0 260Z" fill={oscuro ? '#243527' : '#a9bb9d'} opacity="0.9" />
          <rect y="150" width="1200" height="60" fill={oscuro ? '#111713' : '#f4f6f2'} opacity="0.55" />
        </svg>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex items-center gap-2 text-[12px] font-medium text-moss">
            <TreePine size={15} /> Bosque mesófilo de montaña · Xalapa, Veracruz
          </div>
          <h1 className="font-display text-[34px] sm:text-[46px] leading-[1.05] mt-2 max-w-3xl">
            Microclima del bosque de niebla
          </h1>
          <p className="text-ink2 mt-3 max-w-2xl text-[15px]">
            Treinta y seis años de temperatura y lluvia reales (reanálisis ERA5) en un dashboard que además te enseña, paso a paso, el análisis con Pandas y NumPy que hay detrás de cada gráfica.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            <button
              onClick={() => setPanel(true)}
              className="inline-flex items-center gap-2 rounded-full bg-moss text-card px-4 py-2 text-[13px] font-semibold hover:opacity-90 transition"
            >
              <BookOpen size={15} /> ¿Cómo se hizo en Pandas?
            </button>
            <a
              href="#inecol"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card/70 px-4 py-2 text-[13px] font-medium hover:bg-card transition"
            >
              <Leaf size={15} className="text-moss" /> Conoce al INECOL
            </a>
            <button
              onClick={() => setOscuro((o) => !o)}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card/70 px-3 py-2 text-[13px] hover:bg-card transition"
              aria-label="Cambiar tema"
            >
              {oscuro ? <Sun size={15} /> : <Moon size={15} />} {oscuro ? 'Día' : 'Noche'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Filtros */}
        <div className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-4 py-3 bg-bg/90 backdrop-blur border-b sm:border sm:rounded-2xl border-line flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-ink2 mr-1">Décadas:</span>
          {DECADAS.map((d) => {
            const activa = decadas.includes(d)
            return (
              <button
                key={d}
                onClick={() => alternarDecada(d)}
                aria-pressed={activa}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium border transition ${activa ? 'bg-card border-ink/20 text-ink shadow-sm' : 'border-line text-muted hover:text-ink'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: activa ? pal.decadas[d] : 'transparent', border: `2px solid ${pal.decadas[d]}` }} />
                {d}
              </button>
            )
          })}
          <button onClick={() => setDecadas(DECADAS)} className="text-[12px] text-moss underline-offset-2 hover:underline ml-1">
            Todas
          </button>
          <span className="flex-1" />
          <span className="text-[12px] text-ink2 mr-1">Fuente:</span>
          <Segmentado opciones={[['real', 'Reales · ERA5'], ['sim', 'Simulados']]} valor={fuente} onCambio={setFuente} />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icono={Thermometer} etiqueta="Temperatura media" valor={fmt(st.tempMedia)} unidad="°C" nota={`Anomalía ${signo(st.anomMedia)} °C vs. 1990–2019`} />
          <Kpi icono={Droplets} etiqueta="Lluvia anual" valor={fmt(st.lluviaAnual, 0)} unidad="mm" nota="Promedio de las décadas elegidas" />
          <Kpi icono={CloudFog} etiqueta="Días con niebla" valor={fmt(st.nieblaAnual, 0)} unidad="al año" nota={`Simulados · correlación con lluvia r = ${fmt(st.r, 2)}`} />
          <Kpi icono={Zap} etiqueta="Lluvias extremas" valor={fmt(st.extremosAnio, 1)} unidad="por año" nota={`Días con más de ${umbral} mm`} />
        </div>

        {/* Mapa de calor */}
        <Tarjeta
          titulo="Anomalías térmicas, mes a mes"
          subtitulo={`Diferencia contra la normal de cada mes. Tendencia: ${signo(st.pendiente * 10)} °C por década.`}
          icono={Thermometer}
          onInfo={() => abrirInfo('calor')}
        >
          <MapaCalor filas={st.calor} pal={pal} />
          <ComparaFuentes c={comparacion} pal={pal} ejes={ejes} />
        </Tarjeta>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Doble eje */}
          <Tarjeta
            titulo="Lluvia y niebla"
            subtitulo={`Ciclo anual promedio: precipitación mensual${fuente === 'real' ? ' real' : ''} (barras) y días con niebla simulados (línea).`}
            icono={CloudRain}
            onInfo={() => abrirInfo('doble')}
            acciones={<Segmentado opciones={[['doble', 'Doble eje'], ['sep', 'Separadas']]} valor={vistaDoble} onCambio={setVistaDoble} />}
          >
            {vistaDoble === 'doble' ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={st.ciclo} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={pal.grid} />
                    <XAxis dataKey="mes" {...ejes} />
                    <YAxis yAxisId="mm" {...ejes} tick={{ fill: pal.lluvia, fontSize: 11 }} unit=" mm" width={72} />
                    <YAxis yAxisId="dias" orientation="right" {...ejes} tick={{ fill: pal.niebla, fontSize: 11 }} domain={[0, 31]} unit=" d" width={40} />
                    <Tooltip
                      cursor={{ fill: pal.grid, opacity: 0.5 }}
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <CajaTooltip
                            titulo={label}
                            filas={[
                              [pal.lluvia, 'Precipitación', `${fmt(payload[0].payload.precip)} mm`],
                              [pal.niebla, 'Días con niebla', fmt(payload[0].payload.niebla)],
                              [null, 'mm por día de niebla', fmt(payload[0].payload.precip / Math.max(payload[0].payload.niebla, 1))],
                            ]}
                          />
                        ) : null
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: pal.texto }} iconType="circle" />
                    <Bar yAxisId="mm" dataKey="precip" name="Precipitación (mm)" fill={pal.lluvia} radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Line yAxisId="dias" dataKey="niebla" name="Días con niebla" stroke={pal.niebla} strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: oscuro ? '#18201b' : '#fbfbf8' }} activeDot={{ r: 6 }} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[12px] text-ink2">Precipitación mensual (mm)</div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={st.ciclo} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} syncId="sep">
                      <CartesianGrid vertical={false} stroke={pal.grid} />
                      <XAxis dataKey="mes" {...ejes} />
                      <YAxis {...ejes} width={48} />
                      <Tooltip cursor={{ fill: pal.grid, opacity: 0.5 }} content={({ active, payload, label }) => (active && payload?.length ? <CajaTooltip titulo={label} filas={[[pal.lluvia, 'Precipitación', `${fmt(payload[0].value)} mm`]]} /> : null)} />
                      <Bar dataKey="precip" fill={pal.lluvia} radius={[4, 4, 0, 0]} maxBarSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-[12px] text-ink2">Días con niebla por década</div>
                <div className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={st.porDecadaCiclo} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} syncId="sep">
                      <CartesianGrid vertical={false} stroke={pal.grid} />
                      <XAxis dataKey="mes" {...ejes} />
                      <YAxis {...ejes} width={48} domain={[5, 'auto']} />
                      <Tooltip
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <CajaTooltip titulo={label} filas={payload.map((p) => [p.color, p.dataKey, `${fmt(p.value)} días`])} />
                          ) : null
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: pal.texto }} iconType="circle" />
                      {decadas.map((d) => (
                        <Line key={d} dataKey={d} stroke={pal.decadas[d]} strokeWidth={2} dot={false} activeDot={{ r: 5 }} type="monotone" />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Tarjeta>

          {/* Lluvias extremas */}
          <Tarjeta
            titulo="Lluvias extremas"
            subtitulo="Cómo se reparten los días de lluvia por intensidad, normalizado por años de cada década."
            icono={Zap}
            onInfo={() => abrirInfo('lluvia')}
            acciones={<Segmentado opciones={[['hist', 'Histograma'], ['violin', 'Violín']]} valor={vistaLluvia} onCambio={setVistaLluvia} />}
          >
            <div className="flex items-center gap-3 mb-3 text-[12px] text-ink2">
              <label htmlFor="umbral" className="whitespace-nowrap">Umbral</label>
              <input
                id="umbral"
                type="range"
                min="20"
                max="100"
                step="5"
                value={umbral}
                onChange={(e) => setUmbral(Number(e.target.value))}
                className="flex-1 accent-[var(--moss)]"
              />
              <span className="font-mono text-ink w-14 text-right">{umbral} mm</span>
            </div>
            {vistaLluvia === 'hist' ? (
              <div className="h-[262px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={st.hist} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="18%">
                    <CartesianGrid vertical={false} stroke={pal.grid} />
                    <XAxis dataKey="rango" {...ejes} interval={0} fontSize={10} />
                    <YAxis {...ejes} width={44} scale="sqrt" domain={[0, 'auto']} />
                    <Tooltip
                      cursor={{ fill: pal.grid, opacity: 0.5 }}
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <CajaTooltip
                            titulo={`${label} mm${payload[0].payload.hasta > umbral ? ' · incluye extremos' : ''}`}
                            filas={payload.map((p) => [p.color, p.dataKey, `${fmt(p.value, 2)} días/año`])}
                          />
                        ) : null
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: pal.texto }} iconType="circle" />
                    {decadas.map((d) => (
                      <Bar
                        key={d}
                        dataKey={d}
                        fill={pal.decadas[d]}
                        radius={[3, 3, 0, 0]}
                        shape={(p) => (
                          <rect x={p.x} y={p.y} width={p.width} height={Math.max(p.height, 0)} rx="3" fill={p.fill} opacity={p.payload.hasta > umbral ? 1 : 0.3} />
                        )}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Violin grupos={st.grupos} umbral={umbral} pal={pal} />
            )}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {st.extPorDecada.map((e) => (
                <div key={e.decada} className="rounded-xl border border-line px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-ink2">
                    <span className="w-2 h-2 rounded-full" style={{ background: pal.decadas[e.decada] }} /> {e.decada}
                  </div>
                  <div className="font-mono text-[15px] text-ink tabular-nums">{fmt(e.porAnio, 1)}<span className="text-[11px] text-muted"> /año</span></div>
                </div>
              ))}
            </div>
            <p className="text-[11.5px] text-muted mt-2">
              {vistaLluvia === 'hist'
                ? 'Las barras opacas son rangos que alcanzan el umbral; el eje usa escala de raíz cuadrada para que se vean los extremos raros.'
                : 'Cada violín es la densidad (KDE) de la lluvia diaria; el punto blanco es la mediana y los puntos sueltos, los eventos sobre el umbral.'}
            </p>
          </Tarjeta>
        </div>

        {/* INECOL */}
        <section id="inecol" className="rounded-2xl overflow-hidden border border-line bg-card grid md:grid-cols-[1.2fr_1fr]">
          <div className="p-5 sm:p-7">
            <div className="inline-flex items-center gap-2 rounded-full bg-mossSoft text-moss px-3 py-1 text-[12px] font-semibold">
              <Leaf size={14} /> Instituto de Ecología, A.C. (INECOL)
            </div>
            <h2 className="font-display text-[26px] leading-tight mt-3">Quienes cuidan y estudian el bosque de niebla</h2>
            <p className="text-ink2 mt-2 text-[14.5px]">
              El INECOL es un centro público de investigación con sede en Xalapa que estudia la biodiversidad y los ecosistemas de México. El bosque mesófilo de montaña ocupa
              menos del 1 % del territorio nacional, pero alberga una enorme proporción de las especies de plantas del país, y es el que captura la niebla que abastece de agua a la región.
            </p>
            <ul className="mt-4 space-y-2 text-[14px] text-ink2">
              <li className="flex gap-2"><TreePine size={16} className="text-moss mt-0.5 shrink-0" /> Visita el Jardín Botánico Francisco Javier Clavijero y el Santuario del Bosque de Niebla.</li>
              <li className="flex gap-2"><BookOpen size={16} className="text-moss mt-0.5 shrink-0" /> Consulta sus posgrados, publicaciones y programas de divulgación.</li>
              <li className="flex gap-2"><Droplets size={16} className="text-moss mt-0.5 shrink-0" /> Apoya la conservación: el agua de Xalapa depende de estos bosques.</li>
            </ul>
            <a
              href="https://www.inecol.mx"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 mt-5 rounded-full bg-moss text-card px-4 py-2 text-[13px] font-semibold hover:opacity-90 transition"
            >
              Visitar inecol.mx <ExternalLink size={14} />
            </a>
          </div>
          <div className="relative min-h-[220px] bg-mossSoft">
            <svg viewBox="0 0 400 300" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <rect width="400" height="300" fill={oscuro ? '#1b271e' : '#dfe8d6'} />
              {[...Array(14)].map((_, i) => {
                const x = 10 + i * 29
                const h = 90 + ((i * 53) % 70)
                return <path key={i} d={`M${x} ${300 - h} l-22 ${h} h44z`} fill={oscuro ? '#2c4430' : '#6f8f55'} opacity={0.5 + (i % 3) * 0.2} />
              })}
              <rect y="150" width="400" height="34" fill={oscuro ? '#cfd8cc' : '#ffffff'} opacity="0.35" />
              <rect y="196" width="400" height="22" fill={oscuro ? '#cfd8cc' : '#ffffff'} opacity="0.25" />
              <circle cx="320" cy="60" r="26" fill={oscuro ? '#e8e2c8' : '#f6e7c8'} opacity="0.8" />
            </svg>
          </div>
        </section>

        <footer className="text-[12px] text-muted pb-8 pt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>Temperatura y lluvia: reanálisis ERA5 vía Open-Meteo (celda 19.51, −96.97, 1405 m) y NASA POWER. Días con niebla: simulados con NumPy. Modo «Simulados»: todo generado para aprender.</span>
          <span>Hecho con React, Tailwind y Recharts · By Brian Hawkins</span>
        </footer>
      </main>

      {!panel && (
        <button
          onClick={() => setPanel(true)}
          className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-code text-[#a7d47b] border border-[#2a352d] px-4 py-2.5 text-[13px] font-mono shadow-xl hover:scale-[1.03] transition"
        >
          <Code2 size={15} /> import pandas as pd
        </button>
      )}
      <PanelAprendizaje abierto={panel} tab={tab} setTab={setTab} onCerrar={() => setPanel(false)} st={st} />
    </div>
  )
}
