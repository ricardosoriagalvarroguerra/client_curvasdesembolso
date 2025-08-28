import React, { useMemo, useState } from 'react'

export default function PointsTable({ points }) {
  const [sortKey, setSortKey] = useState('y')
  const [sortDir, setSortDir] = useState('desc')
  const [clsFilter, setClsFilter] = useState({ above: true, average: true, below: true })

  const filtered = useMemo(() => {
    return (points || []).filter(p => clsFilter[p.class] === true)
  }, [points, clsFilter])

  const sorted = useMemo(() => {
    const arr = filtered.slice()
    arr.sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      if (va === vb) return 0
      const s = va < vb ? -1 : 1
      return sortDir === 'asc' ? s : -s
    })
    return arr
  }, [filtered, sortKey, sortDir])

  function setSort(k) {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div className="row" style={{ gap:12, flexWrap:'wrap' }}>
        {['above','average','below'].map(c => (
          <label key={c} className="row" style={{ gap:6, color:'var(--muted)' }}>
            <input type="checkbox" checked={clsFilter[c]} onChange={e => setClsFilter(prev => ({ ...prev, [c]: e.target.checked }))} /> {c}
          </label>
        ))}
      </div>
      <div style={{ overflow:'auto', maxHeight: 260, border:'1px solid var(--border)', borderRadius:6, marginTop:6 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ position:'sticky', top:0, background:'var(--input-bg)' }}>
              <Th label="iatiidentifier" onSort={() => setSort('iatiidentifier')} active={sortKey==='iatiidentifier'} dir={sortDir} />
              <Th label="k" onSort={() => setSort('k')} active={sortKey==='k'} dir={sortDir} />
              <Th label="d" onSort={() => setSort('d')} active={sortKey==='d'} dir={sortDir} />
              <Th label="hd" onSort={() => setSort('hd')} active={sortKey==='hd'} dir={sortDir} />
              <Th label="y" onSort={() => setSort('y')} active={sortKey==='y'} dir={sortDir} />
              <th>class</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => (
              <tr key={idx}>
                <td style={{ padding:'6px 8px', borderTop:'1px solid var(--border)' }}>{p.iatiidentifier}</td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid var(--border)' }}>{p.k}</td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid var(--border)' }}>{p.d.toFixed(3)}</td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid var(--border)' }}>{p.hd.toFixed(3)}</td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid var(--border)' }}>{p.y.toFixed(3)}</td>
                <td style={{ padding:'6px 8px', borderTop:'1px solid var(--border)' }}>{p.class}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ label, onSort, active, dir }) {
  return (
    <th onClick={onSort} style={{ cursor:'pointer', padding:'6px 8px', textAlign:'left', color: active ? 'var(--text)' : 'var(--muted)' }}>
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )
}


