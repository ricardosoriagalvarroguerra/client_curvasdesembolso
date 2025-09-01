import React, { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import * as d3 from 'd3'
import { postCurveFit, getProjectTimeseries } from '../api/client'
import { MACROSECTOR_LABELS, MODALITY_LABELS } from '../labels'
import SeriesKPIs from './SeriesKPIs.jsx'
import ProjectPopover from './ProjectPopover.jsx'

export default function CurveWorkbench({ filters, compareItems = [], showActivePoints = true, showPointCloud = false }) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)
  const tsCacheRef = useRef(new Map())
  const hoveringPointRef = useRef(false)
  const [showScatter, setShowScatter] = useState(showActivePoints)
  const [compareResults, setCompareResults] = useState([])
  const [showResidualsPanel, setShowResidualsPanel] = useState(false)
  const [showMethodologyPanel, setShowMethodologyPanel] = useState(false)
  const [popover, setPopover] = useState({ open: false, data: null })
  // Start with prediction bands hidden by default
  const [showBands, setShowBands] = useState(false)
  const [bandMethod, setBandMethod] = useState('bootstrap')
  const [bandLevel, setBandLevel] = useState('90')

  async function fetchSeries(pid) {
    const cache = tsCacheRef.current
    if (cache.has(pid)) return cache.get(pid)
    try {
      const resp = await getProjectTimeseries(pid, { yearFrom: filters.yearFrom, yearTo: filters.yearTo })
      const series = Array.isArray(resp?.series) ? resp.series.map(p => ({ k: p.k, d: p.d })) : []
      const payload = { project: resp?.project, series }
      cache.set(pid, payload)
      return payload
    } catch {
      const payload = { project: { iatiidentifier: pid }, series: [] }
      cache.set(pid, payload)
      return payload
    }
  }

  async function openProject(pid) {
    const data = await fetchSeries(pid)
    setPopover({ open: true, data })
  }

  const stableFilters = useMemo(() => ({ ...filters }), [filters.macrosectors, filters.modalities, filters.countries, filters.mdbs, filters.ticketMin, filters.ticketMax, filters.yearFrom, filters.yearTo, filters.onlyExited])
  const { data, error } = useSWR(
    ['curve', JSON.stringify(stableFilters)],
    ([, body], { signal } = {}) => postCurveFit(JSON.parse(body), { signal }),
    { revalidateOnFocus: false, dedupingInterval: 300, keepPreviousData: true }
  )

  // Dynamic label for main series (prepend MDB prefix if selected)
  const mainLabel = useMemo(() => {
    const hasOneMacro = filters.macrosectors?.length === 1
    const macroId = hasOneMacro ? filters.macrosectors[0] : null
    const macroLabel = hasOneMacro ? (MACROSECTOR_LABELS[macroId] || '') : 'Global'
    const hasOneMod = filters.modalities?.length === 1
    const modId = hasOneMod ? filters.modalities[0] : null
    const modLabel = hasOneMod ? (MODALITY_LABELS[modId] || 'Todas') : 'Todas'
    const countryLabel = (filters.countries?.length === 1) ? filters.countries[0] : 'Global'
    const base = (hasOneMacro && macroLabel)
      ? `${countryLabel} · ${macroLabel} · ${modLabel}`
      : (hasOneMacro && !macroLabel)
        ? `${countryLabel} · ${modLabel}`
        : `${countryLabel} · Global · ${modLabel}`
    const mdbPrefix = (Array.isArray(filters.mdbs) && filters.mdbs.length === 1) ? filters.mdbs[0] : null
    return mdbPrefix ? `${mdbPrefix} · ${base}` : base
  }, [filters.macrosectors, filters.modalities, filters.countries, filters.mdbs])

  // Fetch comparison curves imperativamente (hasta 4) cuando cambian compareItems
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const results = await Promise.all(
          (compareItems || []).map(ci => {
            // Preserve the year interval captured when the series was added.
            const mergedFilters = { ...ci.filters }
            return postCurveFit(mergedFilters)
          })
        )
        if (alive) setCompareResults(results)
      } catch (e) {
        if (alive) setCompareResults([])
        console.error(e)
      }
    }
    if (compareItems?.length) load(); else setCompareResults([])
    return () => { alive = false }
  }, [JSON.stringify(compareItems), filters.yearFrom, filters.yearTo])

  // Create tooltip once
  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'tooltip'
    el.style.display = 'none'
    document.body.appendChild(el)
    tooltipRef.current = el
    return () => { el.remove() }
  }, [])

  // Sync band settings with query params on mount
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const pb = qs.get('pb')
    setShowBands(pb === null ? false : pb === '1')
    setBandMethod(qs.get('pb_m') || 'bootstrap')
    setBandLevel(qs.get('pb_l') || '90')
  }, [])

  // Persist band settings to query string
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    if (showBands) qs.set('pb', '1'); else qs.delete('pb')
    qs.set('pb_m', bandMethod)
    qs.set('pb_l', bandLevel)
    const newUrl = `${window.location.pathname}?${qs.toString()}${window.location.hash}`
    window.history.replaceState(null, '', newUrl)
  }, [showBands, bandMethod, bandLevel])


  // Sync showScatter with prop from sidebar and view mode
  useEffect(() => {
    setShowScatter(!!showActivePoints)
  }, [showActivePoints])

  useEffect(() => {
    if (!data) return
    const svgEl = svgRef.current
    if (!svgEl) return

    const width = svgEl.clientWidth || 900
    const height = svgEl.clientHeight || 520
    const margin = { top: 12, right: 18, bottom: 32, left: 44 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Determine a consistent X-domain across all visible curves
    const compareList = Array.isArray(compareResults) ? compareResults : []
    const domainCandidates = []
    if (data?.kDomain?.[1] != null) domainCandidates.push(data.kDomain[1])
    compareList.forEach(cd => { if (cd?.kDomain?.[1] != null) domainCandidates.push(cd.kDomain[1]) })
    const KMAX = domainCandidates.length ? Math.max(...domainCandidates) : (data.kDomain?.[1] ?? 120)
    const x = d3.scaleLinear().domain([0, KMAX]).range([0, innerW])
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0])
    const line = d3.line().defined(d => isFinite(d.hd)).x(d => x(d.k)).y(d => y(d.hd))

    // Axes: show only y thresholds 30/50/80%
    const yThresholds = [0.3, 0.5, 0.8]
    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).tickSizeOuter(0))
    g.append('g').call(d3.axisLeft(y)
      .tickValues(yThresholds)
      .tickFormat(d => `${Math.round(d * 100)}%`)
      .tickSizeOuter(0)
    )
    g.append('g')
      .selectAll('line')
      .data(yThresholds)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', d => y(d))
      .attr('y2', d => y(d))
      .attr('stroke', '#000')
      .attr('stroke-opacity', 0.9)
      .attr('stroke-width', 1)

    // Historical quantile bands
    const rawBands = Array.isArray(data?.bands)
      ? data.bands.map(b => {
          const pick = (...keys) => {
            for (const k of keys) if (b[k] != null) return b[k]
            return undefined
          }
          return {
            k: b.k,
            p2_5: pick('p2_5', 'p_2_5', 'p025', 'p02_5', 'lower95', 'lower'),
            p05: pick('p05', 'p_05', 'p5', 'lower90', 'lower'),
            p10: pick('p10', 'p_10', 'lower80', 'q10'),
            p50: pick('p50', 'p_50', 'median', 'q50'),
            p90: pick('p90', 'p_90', 'upper80', 'q90'),
            p95: pick('p95', 'p_95', 'upper90', 'upper'),
            p97_5: pick('p97_5', 'p_97_5', 'p975', 'upper95', 'upper')
          }
        })
      : []
    const bands = showBands ? rawBands : []
    if (bands.length) {
      const area95 = d3.area()
        .defined(d => isFinite(d.p2_5) && isFinite(d.p97_5))
        .x(d => x(d.k))
        .y0(d => y(d.p2_5))
        .y1(d => y(d.p97_5))
      g.append('path')
        .datum(bands)
        .attr('fill', 'var(--line-main)')
        .attr('fill-opacity', 0.05)
        .attr('stroke', 'none')
        .attr('d', area95)

      const area90 = d3.area()
        .defined(d => isFinite(d.p05) && isFinite(d.p95))
        .x(d => x(d.k))
        .y0(d => y(d.p05))
        .y1(d => y(d.p95))
      g.append('path')
        .datum(bands)
        .attr('fill', 'var(--line-main)')
        .attr('fill-opacity', 0.1)
        .attr('stroke', 'none')
        .attr('d', area90)

      const area80 = d3.area()
        .defined(d => isFinite(d.p10) && isFinite(d.p90))
        .x(d => x(d.k))
        .y0(d => y(d.p10))
        .y1(d => y(d.p90))
      g.append('path')
        .datum(bands)
        .attr('fill', 'var(--line-main)')
        .attr('fill-opacity', 0.15)
        .attr('stroke', 'none')
        .attr('d', area80)

      const medLine = d3.line()
        .defined(d => isFinite(d.p50))
        .x(d => x(d.k))
        .y(d => y(d.p50))
      g.append('path')
        .datum(bands)
        .attr('fill', 'none')
        .attr('stroke', 'var(--line-main)')
        .attr('stroke-width', 2)
        .attr('d', medLine)
    }

    // Median line when bands hidden but available
    if (!bands.length && rawBands.length) {
      const medLine = d3.line()
        .defined(d => isFinite(d.p50))
        .x(d => x(d.k))
        .y(d => y(d.p50))
      g.append('path')
        .datum(rawBands)
        .attr('fill', 'none')
        .attr('stroke', 'var(--line-main)')
        .attr('stroke-width', 2)
        .attr('d', medLine)
    }

    // Only the historical curve line for main filters when no bands available
    const params = data?.params
    if (!bands.length && !rawBands.length && params) {
      const curve = []
      const { b0, b1, b2 } = params
      const logistic3 = (k) => 1 / (1 + Math.exp(-(b0 + b1 * k + b2 * k * k)))
      const kMaxLocal = data.kDomain?.[1] ?? 120
      for (let k = 0; k <= kMaxLocal; k++) curve.push({ k, hd: logistic3(k) })
      g.append('path')
        .datum(curve)
        .attr('fill', 'none')
        .attr('stroke', 'var(--line-main)')
        .attr('stroke-width', 2)
        .attr('d', line)
    }

    // Additional comparison curves (up to 4)
    const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)']
    compareList.forEach((cd, idx) => {
      if (!cd || !cd.params) return
      const { b0, b1, b2 } = cd.params
      const logistic3 = (k) => 1 / (1 + Math.exp(-(b0 + b1 * k + b2 * k * k)))
      const kMaxLocal = Math.min(cd.kDomain?.[1] ?? 120, KMAX)
      const curveC = []
      for (let k = 0; k <= kMaxLocal; k++) curveC.push({ k, hd: logistic3(k) })
      g.append('path')
        .datum(curveC)
        .attr('fill', 'none')
        .attr('stroke', colors[idx % colors.length])
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 4')
        .attr('d', line)
    })

    // Selected project curve overlay removed with project mode

    // Tooltip helpers for per-project mini sparkline (real cumulative)
    function renderSparklineSVG(series) {
      const w = 180, h = 70
      const padL = 32, padR = 8, padT = 6, padB = 20
      const innerW = Math.max(1, w - padL - padR)
      const innerH = Math.max(1, h - padT - padB)
      // Align x-domain with main chart: 0..KMAX months
      const sx = (k) => padL + innerW * (Math.max(0, Math.min(KMAX, k)) / Math.max(1, KMAX))
      const sy = (dval) => padT + innerH - innerH * Math.max(0, Math.min(1, dval))
      const yTicks = [0.3, 0.5, 0.8]
      const gridColor = '#495057'
      const gridOpacity = 0.4
      const axisColor = '#6c757d'
      const labelColor = '#adb5bd'
      let path = ''
      for (let i = 0; i < series.length; i++) {
        const px = sx(series[i].k)
        const py = sy(series[i].d)
        path += (i === 0 ? 'M' : 'L') + px + ',' + py
      }
      const gridLines = yTicks.map(t => `<line x1="${padL}" x2="${w - padR}" y1="${sy(t)}" y2="${sy(t)}" stroke="${gridColor}" stroke-opacity="${gridOpacity}" />`).join('')
      const yLabels = yTicks.map(t => `<text x="${4}" y="${sy(t) + 3}" fill="${labelColor}" font-size="9" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">${Math.round(t*100)}%</text>`).join('')
      const xAxis = `<line x1="${padL}" x2="${w - padR}" y1="${sy(0)}" y2="${sy(0)}" stroke="${axisColor}" stroke-width="1" />`
      const xLabels = `<text x="${padL}" y="${h - 4}" fill="${labelColor}" font-size="9" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">0</text>
        <text x="${w - padR}" y="${h - 4}" text-anchor="end" fill="${labelColor}" font-size="9" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">${KMAX}</text>`
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#212529" rx="4" ry="4" />
  <g>${gridLines}</g>
  <g>${yLabels}</g>
  ${xAxis}
  ${xLabels}
  <path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" />
</svg>`
    }

    function showPointTooltip(e, point, color) {
      hoveringPointRef.current = true
      const t = tooltipRef.current
      if (!t) return
      t.style.display = 'block'
      t.style.left = (e.clientX + 12) + 'px'
      t.style.top = (e.clientY + 12) + 'px'
      t.style.color = 'var(--text)'
      t.style.border = '1px solid var(--border)'
      t.style.background = 'var(--input-bg)'
      t.style.padding = '8px'
      t.style.borderRadius = '6px'
      t.style.pointerEvents = 'none'

      // Lightweight immediate info
      t.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${point.iatiidentifier}</div>
        <div style="color:var(--muted);margin-bottom:6px"><span style="display:inline-block;width:10px;height:6px;background:${color};margin-right:6px;vertical-align:middle;border-radius:2px"></span>k=${point.k} meses · d=${(point.d*100).toFixed(1)}%</div>
        <div style="color:var(--muted)">Cargando serie...</div>`

      // Fetch and replace with sparkline (cached)
      fetchSeries(point.iatiidentifier).then(result => {
        const series = Array.isArray(result?.series) ? result.series : []
        const macroId = result?.project?.macrosector_id ?? null
        const macroName = macroId != null ? (MACROSECTOR_LABELS[macroId] || `${macroId}`) : '—'
        const modId = result?.project?.modality_id ?? null
        const modalityName = modId != null ? (MODALITY_LABELS[modId] || `${modId}`) : '—'
        if (!series || !series.length) {
          t.innerHTML = `<div style=\"font-weight:600;margin-bottom:4px\">${point.iatiidentifier}</div>
            <div style=\"color:var(--muted);margin-bottom:4px\"><span style=\"display:inline-block;width:10px;height:6px;background:${color};margin-right:6px;vertical-align:middle;border-radius:2px\"></span>k=${point.k} meses · d=${(point.d*100).toFixed(1)}%</div>
            <div style=\"color:var(--muted);margin-bottom:6px\">Macrosector: ${macroName} · Modalidad: ${modalityName}</div>
            <div style=\"color:var(--muted)\">Sin datos de serie</div>`
          return
        }
        t.innerHTML = `<div style=\"font-weight:600;margin-bottom:4px\">${point.iatiidentifier}</div>
          <div style=\"color:var(--muted);margin-bottom:4px\"><span style=\"display:inline-block;width:10px;height:6px;background:${color};margin-right:6px;vertical-align:middle;border-radius:2px\"></span>k=${point.k} meses · d=${(point.d*100).toFixed(1)}%</div>
          <div style=\"color:var(--muted);margin-bottom:6px\">Macrosector: ${macroName} · Modalidad: ${modalityName}</div>
          <div style=\"color:${color}\">${renderSparklineSVG(series)}</div>`
      })
    }

    function hideTooltip() {
      hoveringPointRef.current = false
      const t = tooltipRef.current
      if (t) t.style.display = 'none'
    }

    // Highlight helpers: emphasize all circles with same iatiidentifier
    function highlightPid(pid, color) {
      const svgSel = d3.select(svgEl)
      svgSel.selectAll('circle.pt')
        .attr('fill-opacity', function () {
          const base = d3.select(this).attr('data-base-op') || 0.3
          const dp = d3.select(this).attr('data-pid')
          return dp === pid ? Math.max(0.85, +base) : 0.08
        })
        .attr('stroke', function () {
          const dp = d3.select(this).attr('data-pid')
          return dp === pid ? color : 'none'
        })
        .attr('stroke-width', function () {
          const dp = d3.select(this).attr('data-pid')
          return dp === pid ? 1.1 : null
        })
    }

    function clearHighlight() {
      const svgSel = d3.select(svgEl)
      svgSel.selectAll('circle.pt')
        .attr('fill-opacity', function () { return d3.select(this).attr('data-base-op') || 0.3 })
        .attr('stroke', 'none')
        .attr('stroke-width', null)
    }

    // Point cloud of ALL snapshots (EXITED + ACTIVE) for visual exploration
    if (showPointCloud) {
      const drawCloud = (points, color) => {
        const pts = Array.isArray(points) ? points : []
        if (!pts.length) return
        // Spatial binning decimation to limit DOM nodes and CPU
        const binSize = 3 // px
        const bins = new Map()
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]
          const px = Math.floor(x(p.k) / binSize)
          const py = Math.floor(y(p.d) / binSize)
          const key = px + ':' + py
          if (!bins.has(key)) bins.set(key, p)
        }
        const reduced = Array.from(bins.values())
        g.append('g')
          .attr('fill', color)
          .attr('fill-opacity', 0.35)
          .attr('data-layer', 'cloud')
          .selectAll('circle')
          .data(reduced)
          .join('circle')
          .classed('pt', true)
          .attr('data-pid', d => d.iatiidentifier)
          .attr('data-base-op', 0.35)
          .attr('cx', d => x(d.k))
          .attr('cy', d => y(d.d))
          .attr('r', 1.6)
          .on('mouseenter', function (e, d) { e.stopPropagation(); highlightPid(d.iatiidentifier, color); showPointTooltip(e, d, color) })
          .on('mousemove', function (e, d) { e.stopPropagation(); highlightPid(d.iatiidentifier, color); showPointTooltip(e, d, color) })
          .on('mouseleave', function () { clearHighlight(); hideTooltip() })
          .on('click', function (e, d) { hideTooltip(); openProject(d.iatiidentifier) })
      }
      drawCloud(data.points, '#6b7280')
      compareList.forEach((cd, idx) => {
        drawCloud(cd?.points, colors[idx % colors.length])
      })
    }

    // ACTIVE scatter points per series, colored to match lines
    if (showScatter) {
      const active = Array.isArray(data?.activePoints) ? data.activePoints : []
      if (active.length) {
        g.append('g')
          .attr('fill', 'var(--line-main)')
          .attr('fill-opacity', 0.7)
          .attr('data-layer', 'active')
          .selectAll('circle')
          .data(active)
          .join('circle')
          .classed('pt', true)
          .attr('data-pid', d => d.iatiidentifier)
          .attr('data-base-op', 0.7)
          .attr('cx', d => x(d.k))
          .attr('cy', d => y(d.d))
          .attr('r', 2)
          .on('mouseenter', function (e, d) { e.stopPropagation(); highlightPid(d.iatiidentifier, '#2563eb'); showPointTooltip(e, d, '#2563eb') })
          .on('mousemove', function (e, d) { e.stopPropagation(); highlightPid(d.iatiidentifier, '#2563eb'); showPointTooltip(e, d, '#2563eb') })
          .on('mouseleave', function () { clearHighlight(); hideTooltip() })
          .on('click', function (e, d) { hideTooltip(); openProject(d.iatiidentifier) })
      }
      compareList.forEach((cd, idx) => {
        const color = colors[idx % colors.length]
        const activeC = Array.isArray(cd?.activePoints) ? cd.activePoints : []
        if (!activeC.length) return
        g.append('g')
          .attr('fill', color)
          .attr('fill-opacity', 0.7)
          .attr('data-layer', 'active')
          .selectAll('circle')
          .data(activeC)
          .join('circle')
          .classed('pt', true)
          .attr('data-pid', d => d.iatiidentifier)
          .attr('data-base-op', 0.7)
          .attr('cx', d => x(d.k))
          .attr('cy', d => y(d.d))
          .attr('r', 2)
          .on('mouseenter', function (e, d) { e.stopPropagation(); highlightPid(d.iatiidentifier, color); showPointTooltip(e, d, color) })
          .on('mousemove', function (e, d) { e.stopPropagation(); highlightPid(d.iatiidentifier, color); showPointTooltip(e, d, color) })
          .on('mouseleave', function () { clearHighlight(); hideTooltip() })
          .on('click', function (e, d) { hideTooltip(); openProject(d.iatiidentifier) })
      })
    }

    // Threshold markers (50/80/95) for main and comparisons
    // Removed in-curve threshold lines per request

    // Legend will be rendered in HTML below (no foreignObject)

    // Hover for curve values (bind to SVG to not block scatter events)
    const svgSel = d3.select(svgEl)
    svgSel.on('mousemove', (e) => {
      if (hoveringPointRef.current) return
      if (!params) return
      const t = tooltipRef.current
      if (!t) return
      const [mx, my] = d3.pointer(e, g.node())
      const kMaxLocal = KMAX
      const kVal = Math.max(0, Math.min(kMaxLocal, Math.round(x.invert(mx))))

      // Compute hd and rows
      const { b0, b1, b2 } = params
      const hdMain = 1 / (1 + Math.exp(-(b0 + b1 * kVal + b2 * kVal * kVal)))
      const colors = ['#ef4444', '#10b981', '#f59e0b', '#a78bfa', '#22d3ee', '#f472b6', '#34d399']
      let rows = []
      if (!(compareItems?.length)) {
        rows.push({ label: mainLabel, color: '#4ea1f3', pctNum: hdMain * 100 })
      }
      const compHds = []
      compareResults.forEach((cd, idx) => {
        if (!cd || !cd.params) return
        const { b0: cb0, b1: cb1, b2: cb2 } = cd.params
        const hd = 1 / (1 + Math.exp(-(cb0 + cb1 * kVal + cb2 * kVal * kVal)))
        compHds.push({ idx, hd })
        // Use label already includes years, but also append years for clarity if missing
        const item = compareItems[idx]
        const years = item?.filters ? `${item.filters.yearFrom}\u2013${item.filters.yearTo}` : ''
        const label = (item?.label) ? item.label : `Curva ${idx+1}${years ? ' · ' + years : ''}`
        rows.push({ label, color: colors[idx % colors.length], pctNum: hd * 100 })
      })

      // Sort rows by percentage descending
      rows = rows.sort((a, b) => (b.pctNum - a.pctNum))

      // If scatter visible, only show when near a curve path
      if (showScatter) {
        const thresholdPx = 12
        let near = false
        if (!(compareItems?.length)) {
          const yMainPx = y(hdMain)
          if (Math.abs(my - yMainPx) <= thresholdPx) near = true
        }
        if (!near) {
          for (const c of compHds) {
            const yPx = y(c.hd)
            if (Math.abs(my - yPx) <= thresholdPx) { near = true; break }
          }
        }
        if (!near) { t.style.display = 'none'; return }
      }

      t.style.display = 'block'
      t.style.left = (e.clientX + 12) + 'px'
      t.style.top = (e.clientY + 12) + 'px'
      t.style.color = 'var(--text)'
      t.style.border = '1px solid var(--border)'
      t.style.background = 'var(--input-bg)'
      t.innerHTML = `<div style=\"font-weight:600;color:var(--text);margin-bottom:4px\">Mes ${kVal}</div>` +
        rows.map(r => `<div style=\"color:var(--muted)\"><span style=\"display:inline-block;width:10px;height:6px;background:${r.color};margin-right:6px;vertical-align:middle;border-radius:2px\"></span>${r.label}: ${r.pctNum.toFixed(1)}%</div>`).join('')
    })
    svgSel.on('mouseleave', () => {
      const t = tooltipRef.current
      if (t) t.style.display = 'none'
    })
  }, [data, compareResults, JSON.stringify(compareItems), showScatter, showPointCloud, showBands])

  const params = data?.params
  const kpiRows = []
  if (data?.params && !(compareItems?.length)) {
    const years = `${filters.yearFrom}\u2013${filters.yearTo}`
    const mainLabelWithYears = `${mainLabel} · ${years}`
    kpiRows.push({ label: mainLabelWithYears, color: '#4ea1f3', params: data.params, kMax: data.kDomain?.[1] ?? 120 })
  }
  compareResults.forEach((cd, idx) => {
    if (!cd?.params) return
    const item = compareItems[idx]
    const years = item?.filters ? `${item.filters.yearFrom}\u2013${item.filters.yearTo}` : ''
    const label = item?.label ? item.label : `Curva ${idx+1}${years ? ' · ' + years : ''}`
    kpiRows.push({ label, color: ['#ef4444','#10b981','#f59e0b','#a78bfa','#22d3ee','#f472b6','#34d399'][idx%7], params: cd.params, kMax: cd.kDomain?.[1] ?? 120 })
  })

  // Residuals histogram and variance-by-group (client-side with points)
  const residuals = useMemo(() => (Array.isArray(data?.points) ? data.points.map(p => p.y) : []), [data?.points])
  const byGroup = useMemo(() => {
    const pts = Array.isArray(data?.points) ? data.points : []
    const makeStats = arr => {
      if (!arr.length) return { n: 0, mean: null, var: null }
      const m = d3.mean(arr) ?? 0
      const v = d3.variance(arr) ?? 0
      return { n: arr.length, mean: m, var: v }
    }
    const groups = {
      macrosector: new Map(),
      modality: new Map(),
      country: new Map(),
    }
    for (const p of pts) {
      const y = p.y
      if (!Number.isFinite(y)) continue
      const g1 = p.macrosector_id ?? 'NA'
      const g2 = p.modality_id ?? 'NA'
      const g3 = p.country_id ?? 'NA'
      const push = (map, key, val) => { const arr = map.get(key) || []; arr.push(val); map.set(key, arr) }
      push(groups.macrosector, g1, y)
      push(groups.modality, g2, y)
      push(groups.country, g3, y)
    }
    const summarize = (map) => Array.from(map.entries()).map(([k, arr]) => ({ key: k, ...makeStats(arr) })).sort((a,b) => (b.n - a.n))
    return {
      macrosector: summarize(groups.macrosector),
      modality: summarize(groups.modality),
      country: summarize(groups.country).slice(0, 10),
    }
  }, [data?.points])

  return (
    <div>
      {/* KPIs removed per request */}
      {error && (
        <div className="chip" style={{ color:'#ef4444' }}>{error?.message || 'Error'}</div>
      )}
      <div className="summary" style={{ alignItems:'center' }}>
        <button className="chip" style={{ marginLeft: 0 }} onClick={() => setShowResidualsPanel(s => !s)}>
          {showResidualsPanel ? 'Ocultar' : 'Ver'} distribución y varianza por grupos
        </button>
        <button className="chip" style={{ marginLeft: 8 }} onClick={() => setShowBands(s => !s)}>
          {showBands ? 'Ocultar' : 'Ver'} bandas
        </button>
        {showBands && (
          <>
            <select value={bandMethod} onChange={e => setBandMethod(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="rolling_std">rolling_std</option>
              <option value="bootstrap">bootstrap</option>
              <option value="quantile_reg">quantile_reg</option>
            </select>
            <select value={bandLevel} onChange={e => setBandLevel(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="80">80%</option>
              <option value="90">90%</option>
              <option value="95">95%</option>
            </select>
          </>
        )}
        <button className="chip" style={{ marginLeft: 8 }} onClick={() => setShowMethodologyPanel(s => !s)}>
          {showMethodologyPanel ? 'Ocultar' : 'Ver'} ficha metodológica
        </button>
      </div>
      <svg ref={svgRef} className="svg-wrap" role="img" aria-label="Curva de desembolsos" />
      {showResidualsPanel && (
        <div className="grid-2-responsive" style={{ marginTop: 12, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:12 }}>
          <div style={{ border:'1px solid #2a3448', borderRadius:6, padding:8 }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>Histograma de residuales (y = d − hd)</div>
            <ResidualsHistogram values={residuals} bins={30} />
          </div>
          <div style={{ border:'1px solid #2a3448', borderRadius:6, padding:8, overflow:'auto' }}>
            <div style={{ fontWeight:600, marginBottom:6 }}>Varianza por grupos</div>
            <VarianceGroupsTable byGroup={byGroup} />
          </div>
        </div>
      )}
      {showMethodologyPanel && (
        <div style={{ marginTop: 12, border:'1px solid #2a3448', borderRadius:6, padding:8, overflow:'auto' }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>Ficha metodológica</div>
          <MethodologyCard params={data?.params} kDomain={data?.kDomain} />
        </div>
      )}
      <SeriesKPIs rows={kpiRows} />
      <ProjectPopover
        open={popover.open}
        onClose={() => setPopover({ open:false, data:null })}
        data={popover.data}
      />
    </div>
  )
}

// Lightweight KaTeX loader and renderer
let __katexLoadingPromise = null
function ensureKatexLoaded() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.katex) return Promise.resolve()
  if (__katexLoadingPromise) return __katexLoadingPromise
  __katexLoadingPromise = new Promise((resolve) => {
    // Inject CSS if missing
    const cssHref = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
    const existingCss = Array.from(document.styleSheets || []).some(ss => {
      try { return ss.href && ss.href.includes('katex.min.css') } catch { return false }
    })
    if (!existingCss) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = cssHref
      document.head.appendChild(link)
    }
    // Inject JS
    const jsSrc = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'
    const script = document.createElement('script')
    script.src = jsSrc
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })
  return __katexLoadingPromise
}

function LatexBlock({ formula, display = true }) {
  const ref = useRef(null)
  useEffect(() => {
    let alive = true
    ensureKatexLoaded().then(() => {
      if (!alive) return
      try {
        if (window.katex && ref.current) {
          window.katex.render(formula, ref.current, { throwOnError: false, displayMode: !!display })
        }
      } catch {}
    })
    return () => { alive = false }
  }, [formula, display])
  return <div ref={ref} style={{ overflowX:'auto', display:'flex', justifyContent:'center' }} />
}

function MethodologyCard({ params, kDomain }) {
  const hasParams = !!params
  const kMax = Array.isArray(kDomain) ? kDomain[1] : 120
  const fmt = (v, d=3) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—')
  return (
    <div style={{ fontSize:12, lineHeight:1.5 }}>
      <div style={{ marginBottom:8, color:'var(--muted)' }}>Ficha metodológica</div>

      <div style={{ margin:'8px 0', fontWeight:600 }}>1) Definiciones y símbolos</div>
      <ul style={{ marginTop:0, paddingLeft:18 }}>
        <li><strong>k</strong>: mes transcurrido desde la aprobación (k=0 en el mes de aprobación).</li>
        <li><strong>d</strong>: desembolso acumulado relativo al monto aprobado, truncado a [0,1].</li>
        <li><strong>hd(k)</strong>: valor esperado de d en el mes k (curva ajustada).</li>
        <li><strong>z(k)</strong>: argumento lineal de la función logística en k.</li>
        <li><strong>b0, b1, b2</strong>: parámetros del modelo logístico; b0 es el intercepto, b1 la pendiente y b2 la curvatura.</li>
        <li><strong>y</strong>: residual (d − hd(k)).</li>
        <li><strong>Var(y)</strong>: varianza muestral de residuales; <strong>σ</strong>=√Var(y).</li>
        <li><strong>z</strong>: multiplicador para bandas (por defecto ≈1.2816, P10–P90).</li>
        <li><strong>k_p</strong>: mes en el que la curva alcanza o supera el porcentaje p.</li>
        <li><strong>n_obs</strong>, <strong>n_proj</strong>, <strong>n_pts</strong>: nº observaciones, proyectos y puntos, respectivamente.</li>
      </ul>

      <div style={{ margin:'8px 0', fontWeight:600 }}>2) Curva y parámetros</div>
      <LatexBlock formula={String.raw`z(k) = b_0 + b_1 k + b_2 k^2`} />
      <LatexBlock formula={String.raw`hd(k) = \frac{1}{1 + e^{-z(k)}}`} />
      {hasParams && (
        <div style={{ color:'var(--muted)' }}>Parámetros estimados: b0={fmt(params.b0)}, b1={fmt(params.b1)}, b2={fmt(params.b2)}</div>
      )}

      <div style={{ margin:'8px 0', fontWeight:600 }}>3) Umbrales</div>
      <LatexBlock formula={String.raw`k_p = \min\{ k \in \mathbb{N}_0 : hd(k) \ge p \}`} />
      <div style={{ color:'var(--muted)' }}>Se reportan p ∈ {`{`}0.30, 0.50, 0.80{`}`}. {hasParams ? `k30=${fmt(params.k30,0)}m · k50=${fmt(params.k50,0)}m · k80=${fmt(params.k80,0)}m` : ''}</div>

      <div style={{ margin:'8px 0', fontWeight:600 }}>4) Bandas de varianza</div>
      <LatexBlock formula={String.raw`hd(k) \pm z\,\sigma`} />
      <LatexBlock formula={String.raw`\sigma = \sqrt{\operatorname{Var}(y)}`}/>
      {hasParams && (
        <div style={{ color:'var(--muted)' }}>σ={fmt(params.sigma)} · z={fmt(params.band_z)}</div>
      )}

      <div style={{ margin:'8px 0', fontWeight:600 }}>5) Residuales y estadísticos</div>
      <LatexBlock formula={String.raw`y_i = d_i - hd(k_i)`} />
      <LatexBlock formula={String.raw`\operatorname{Var}(y) = \frac{1}{n-1} \sum_{i=1}^n (y_i - \bar y)^2`} />
      {hasParams && (
        <div style={{ color:'var(--muted)' }}>Var(y)={fmt(params.var_y)} · media(y)={fmt(params.mean_y)} · mediana(y)={fmt(params.median_y)}</div>
      )}

      <div style={{ margin:'8px 0', fontWeight:600 }}>6) Dominio y elegibilidad</div>
      <div>Dominio temporal: k ∈ [0, {kMax}] meses.</div>
      <LatexBlock formula={String.raw`n_{obs} \ge 30`} />
      <div style={{ color:'var(--muted)' }}>Prioridad de base: país (1 país, n<sub>proj</sub>≥40, n<sub>pts</sub>≥500), macrosector (n<sub>proj</sub>≥60, n<sub>pts</sub>≥800), o baseline global (Investment).</div>

      <div style={{ margin:'8px 0', fontWeight:600 }}>7) Procedimiento de ajuste</div>
      <ol style={{ marginTop:4, paddingLeft:18 }}>
        <li>Construcción de k y d por proyecto (k=meses desde aprobación):
          <LatexBlock formula={String.raw`d_t = \min\!\left(1, \frac{\sum_{s\le t} disb_s}{approved}\right)`} />
        </li>
        <li>Selección de base según mínimos y ámbito (país/macrosector/global).</li>
        <li>Ajuste logístico:
          <LatexBlock formula={String.raw`(b_0,b_1,b_2,\sigma) = \arg\min \; \frac{1}{n} \sum_{i=1}^n (d_i - hd(k_i))^2`} />
        </li>
        <li>Alineación visual: posible corrimiento de b0 para la vista actual.</li>
        <li>Intervalos de k<sub>p</sub> por bootstrap: percentiles (2.5, 97.5) de {`{`}k<sub>p</sub><sup>(b)</sup>{`}`}</li>
      </ol>

      <div style={{ margin:'8px 0', fontWeight:600 }}>8) Interpretación</div>
      <ul style={{ marginTop:0, paddingLeft:18 }}>
        <li>Curva más empinada ⇒ desembolsos más rápidos (k50 más bajo).</li>
        <li>Bandas estrechas ⇒ menor dispersión (σ pequeña). Bandas anchas ⇒ mayor heterogeneidad.</li>
        <li>y&gt;0: por encima de lo esperado; y&lt;0: por debajo.</li>
      </ul>

      <div style={{ margin:'8px 0', fontWeight:600 }}>9) Notas técnicas</div>
      <ul style={{ marginTop:0, paddingLeft:18 }}>
        <li>z por defecto ≈ 1.2816 (percentiles 10–90); configurable en servidor.</li>
        <li>Se limita hd a [0,1] y se aplica muestreo en visualización para datasets muy grandes.</li>
      </ul>

      <div style={{ marginTop:10, color:'var(--muted)' }}>Interpretación</div>
      <ul style={{ marginTop:4, paddingLeft:18 }}>
        <li>Curva más empinada ⇒ desembolsos más rápidos (k50 más bajo).</li>
        <li>Bandas estrechas ⇒ menor dispersión (σ pequeña). Bandas anchas ⇒ mayor incertidumbre/heterogeneidad.</li>
        <li>Residuales positivos ⇒ casos por encima de lo esperado; negativos ⇒ por debajo.</li>
      </ul>

      <div style={{ marginTop:10, color:'var(--muted)' }}>Notas técnicas</div>
      <ul style={{ marginTop:4, paddingLeft:18 }}>
        <li>z por defecto ≈ 1.2816 (percentiles 10–90); configurable en el servidor.</li>
        <li>Se limita hd a [0,1] y se aplica muestreo cuando hay demasiados puntos para visualización.</li>
        </ul>
        </div>
  )
}

function ResidualsHistogram({ values = [], bins = 30 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.clientWidth || 400
    const h = 180
    const m = { top: 6, right: 8, bottom: 22, left: 30 }
    const iw = w - m.left - m.right
    const ih = h - m.top - m.bottom
    const svg = d3.select(el)
    svg.selectAll('*').remove()
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const arr = (values || []).filter(Number.isFinite)
    if (!arr.length) return

    const x = d3.scaleLinear().domain(d3.extent(arr)).nice().range([0, iw])
    const binsArr = d3.bin().domain(x.domain()).thresholds(bins)(arr)
    const y = d3.scaleLinear().domain([0, d3.max(binsArr, d => d.length) || 1]).nice().range([ih, 0])

    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickSizeOuter(0))
    g.append('g').call(d3.axisLeft(y).ticks(4).tickSizeOuter(0))

    g.selectAll('rect').data(binsArr).join('rect')
      .attr('x', d => x(d.x0))
      .attr('y', d => y(d.length))
      .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
      .attr('height', d => ih - y(d.length))
      .attr('fill', '#60a5fa')
      .attr('fill-opacity', 0.6)
      .attr('stroke', 'none')

    // zero line
    g.append('line')
      .attr('x1', x(0))
      .attr('x2', x(0))
      .attr('y1', 0)
      .attr('y2', ih)
      .attr('stroke', '#9ca3af')
      .attr('stroke-dasharray', '4 4')
  }, [values, bins])
  return <svg ref={ref} style={{ width:'100%', height: 180 }} />
}

function VarianceGroupsTable({ byGroup }) {
  const formatKey = (group, key) => {
    if (key === 'NA') return '—'
    if (group === 'macrosector') return MACROSECTOR_LABELS[key] || key
    if (group === 'modality') return MODALITY_LABELS[key] || key
    if (group === 'ticketSize') return key
    return key
  }
  const Section = ({ title, rows, groupKey }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color:'var(--muted)', marginBottom: 4 }}>{title}</div>
      <div style={{ overflow:'auto', maxHeight: 180 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr>
              <th style={{ textAlign:'left', padding:'4px 6px' }}>Grupo</th>
              <th style={{ textAlign:'right', padding:'4px 6px' }}>n</th>
              <th style={{ textAlign:'right', padding:'4px 6px' }}>Var(y)</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, idx) => (
              <tr key={idx}>
                <td style={{ padding:'4px 6px', borderTop:'1px solid #2a3448' }}>{formatKey(groupKey, r.key)}</td>
                <td style={{ padding:'4px 6px', borderTop:'1px solid #2a3448', textAlign:'right' }}>{r.n}</td>
                <td style={{ padding:'4px 6px', borderTop:'1px solid #2a3448', textAlign:'right' }}>{r.var != null ? r.var.toFixed(4) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
  return (
    <div>
      <Section title="Macrosector" rows={byGroup?.macrosector} groupKey="macrosector" />
      <Section title="Modalidad" rows={byGroup?.modality} groupKey="modality" />
      <Section title="País (top 10 por n)" rows={byGroup?.country} groupKey="country" />
    </div>
  )
}


