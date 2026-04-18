import React from 'react';

export default function TableGrid({ tables, onSelect }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12}}>
      {tables.map(t => (
        <div key={t._id}
          onClick={() => onSelect(t)}
          style={{
            padding: 12,
            borderRadius: 8,
            textAlign:'center',
            cursor: t.status === 'available' ? 'pointer' : 'not-allowed',
            background: t.status === 'available' ? '#eee' :
                        t.status === 'occupied' ? '#ff6b6b' : '#f5d34a'
          }}>
          <div style={{fontWeight:700}}>Table {t.number}</div>
          <div>{t.seats} seats</div>
          <div style={{fontSize:12, marginTop:6}}>{t.status}</div>
        </div>
      ))}
    </div>
  );
}
