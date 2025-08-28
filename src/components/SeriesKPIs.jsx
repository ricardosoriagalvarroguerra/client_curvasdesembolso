import React, { useState } from 'react'

function MiniAxis({ k30, k50, k80, kMax=120, color='#4ea1f3', allRows=[] }) {
  const safe = (v) => (typeof v === 'number' && isFinite(v) ? Math.max(0, v) : null)
  const v30 = safe(k30)
  const v50 = safe(k50)
  const v80 = safe(k80)
  // Use a shared KMAX across all rows so ticks are comparable between series
  const thisMax = safe(kMax) ?? 0
  const globalMax = (allRows || []).reduce((mx, r) => {
    const rk = (typeof r?.kMax === 'number' && isFinite(r.kMax)) ? r.kMax : 0
    return Math.max(mx, rk)
  }, thisMax)
  const total = Math.max(1, globalMax || 120)

  const pos = (v) => `${Math.min(100, Math.max(0, (v/total)*100))}%`
  const listFor = (threshold) => {
    const lines = (allRows || []).map(r => {
      const params = r.params || {}
      const val = threshold === 30 ? params.k30 : threshold === 50 ? params.k50 : params.k80
      const v = (typeof val === 'number' && isFinite(val)) ? `${Math.max(0, Math.round(val))}m` : '-'
      return `${r.label}: ${v}`
    })
    return `${threshold}%\n${lines.join('\n')}`
  }

  const [tip, setTip] = useState({ show:false, left:'0%', text:'' })
  const showTip = (threshold, leftPos) => setTip({ show:true, left:leftPos, text:listFor(threshold) })
  const hideTip = () => setTip(prev => ({ ...prev, show:false }))

  // No global ticks; show per-threshold month labels just below each bar

  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ position:'relative', width:260, height:34 }}>
        {/* baseline axis */}
        <div style={{ position:'absolute', left:0, right:0, top:12, height:2, background:'#000' }} />
        {/* ticks */}
        {v30!=null && (
          <div
            onMouseEnter={() => showTip(30, pos(v30))}
            onMouseLeave={hideTip}
            style={{ position:'absolute', left:pos(v30), top:6, width:8, marginLeft:-3, height:12, background:color, cursor:'default' }}
          />
        )}
        {v50!=null && (
          <div
            onMouseEnter={() => showTip(50, pos(v50))}
            onMouseLeave={hideTip}
            style={{ position:'absolute', left:pos(v50), top:2, width:8, marginLeft:-3, height:16, background:color, cursor:'default' }}
          />
        )}
        {v80!=null && (
          <div
            onMouseEnter={() => showTip(80, pos(v80))}
            onMouseLeave={hideTip}
            style={{ position:'absolute', left:pos(v80), top:6, width:8, marginLeft:-3, height:12, background:color, cursor:'default' }}
          />
        )}
        {/* labels inline above ticks for clarity */}
        {v30!=null && (
          <div style={{ position:'absolute', left:`calc(${pos(v30)} - 10px)`, top:-10, color:'var(--muted)', fontSize:10 }}>30%</div>
        )}
        {v50!=null && (
          <div style={{ position:'absolute', left:`calc(${pos(v50)} - 10px)`, top:-12, color:'var(--text)', fontWeight:600, fontSize:10 }}>50%</div>
        )}
        {v80!=null && (
          <div style={{ position:'absolute', left:`calc(${pos(v80)} - 10px)`, top:-10, color:'var(--muted)', fontSize:10 }}>80%</div>
        )}
        {/* month labels tied to each threshold (e.g., 36m, 50m) */}
        {v30!=null && (
          <div style={{ position:'absolute', left:pos(v30), top:22, transform:'translateX(-50%)', color:'var(--muted)', fontSize:10 }}>
            {Math.round(v30)}m
          </div>
        )}
        {v50!=null && (
          <div style={{ position:'absolute', left:pos(v50), top:22, transform:'translateX(-50%)', color:'var(--text)', fontWeight:600, fontSize:10 }}>
            {Math.round(v50)}m
          </div>
        )}
        {v80!=null && (
          <div style={{ position:'absolute', left:pos(v80), top:22, transform:'translateX(-50%)', color:'var(--muted)', fontSize:10 }}>
            {Math.round(v80)}m
          </div>
        )}
        {tip.show && (
          <div style={{ position:'absolute', left:tip.left, bottom:'24px', transform:'translateX(-50%)', background:'var(--input-bg)', color:'var(--text)', border:'1px solid var(--border)', padding:'6px 8px', borderRadius:4, whiteSpace:'pre', zIndex:2, boxShadow:'0 2px 8px rgba(0,0,0,0.3)' }}>
            {tip.text}
          </div>
        )}
      </div>
      
    </div>
  )
}

export default function SeriesKPIs({ rows }) {
  // rows: [{ label, color, params, kMax }]
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ overflowX:'auto' }}>
        <div style={{ height:2, background:'#000', margin:'6px 0' }} />
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ textAlign:'left' }}>
              <th style={{ padding:'6px 8px' }}>Serie</th>
              <th style={{ padding:'6px 8px' }}>Umbrales</th>
              <th style={{ padding:'6px 8px' }}>R²</th>
              <th style={{ padding:'6px 8px' }}>Var(y)</th>
              <th style={{ padding:'6px 8px' }}>σ</th>
              
              
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>
                  <span style={{ display:'inline-block', width:14, height:2, background:r.color || 'var(--line-main)', verticalAlign:'middle', marginRight:6 }} />
                  <span>{r.label}</span>
                </td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>
                  <MiniAxis k30={r.params?.k30} k50={r.params?.k50} k80={r.params?.k80} k30_ci={r.params?.k30_ci} k50_ci={r.params?.k50_ci} k80_ci={r.params?.k80_ci} kMax={r.kMax} color={r.color} allRows={rows} />
                </td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>{typeof r.params?.r2 === 'number' && isFinite(r.params.r2) ? r.params.r2.toFixed(3) : '-'}</td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>{r.params?.var_y!=null ? r.params.var_y.toFixed(3) : '-'}</td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>{r.params?.sigma!=null ? r.params.sigma.toFixed(3) : '-'}</td>
                
                
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Indicadores adicionales por serie */}
      <div style={{ height:2, background:'#000', margin:'10px 0' }} />
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ textAlign:'left' }}>
              <th style={{ padding:'6px 8px' }}>Serie</th>
              <th style={{ padding:'6px 8px' }}>Cant Operaciones</th>
              <th style={{ padding:'6px 8px' }}>Cant Desembolsos</th>
              <th style={{ padding:'6px 8px' }}>Ticket Promedio Aprobación</th>
              <th style={{ padding:'6px 8px' }}>% de la Cartera</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const p = r.params || {}
              const nOps = p.n_projects ?? null
              const disbCount = p.disb_count ?? null
              const avg = p.approved_avg ?? null
              const share = p.portfolio_share ?? null
              return (
                <tr key={`ind-${idx}`}>
                  <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>
                    <span style={{ display:'inline-block', width:14, height:2, background:r.color || 'var(--line-main)', verticalAlign:'middle', marginRight:6 }} />
                    <span>{r.label}</span>
                  </td>
                  <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>{nOps ?? '-'}</td>
                  <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>{disbCount ?? '-'}</td>
                  <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>{avg!=null ? avg.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}</td>
                  <td style={{ padding:'6px 8px', borderTop:'1px solid #2a3448' }}>{share!=null ? (share*100).toFixed(2)+'%' : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


