import React, { useState } from 'react';
import API from '../api';

export default function AIAssistant({ tableId, onOrderPlaced }) {
  const [prefs, setPrefs] = useState({ budget: '', category: '' });
  const [recommendations, setRecommendations] = useState(null);

  async function askAI() {
    const res = await API.post('/ai/recommend', { prefs });
    // if server returned parsed recs, use them, else fallback to text
    setRecommendations(res.data.recommendations || res.data.text);
  }

  async function placeOrder(itemIds) {
    // build order with qty 1 for simplicity
    const items = itemIds.map(id => ({ menuItemId: id, qty: 1 }));
    const res = await API.post('/orders', { tableId, items });
    onOrderPlaced && onOrderPlaced(res.data);
  }

  return (
    <div style={{padding:12, border:'1px solid #ddd', borderRadius:8}}>
      <h3>AI Assistant / Waiter</h3>
      <div>
        <input placeholder="Budget (max)" value={prefs.budget} onChange={e=>setPrefs({...prefs,budget:e.target.value})} />
        <input placeholder="Category (Pizza, Main...)" value={prefs.category} onChange={e=>setPrefs({...prefs,category:e.target.value})} />
        <button onClick={askAI}>Suggest</button>
      </div>

      <div style={{marginTop:12}}>
        {recommendations ? (
          typeof recommendations === 'string' ? <pre>{recommendations}</pre> :
          recommendations.map(r => (
            <div key={r.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:8}}>
              <div>
                <div style={{fontWeight:700}}>{r.name} — ₹{r.price}</div>
                <div style={{fontSize:12}}>{r.reason}</div>
              </div>
              <button onClick={()=>placeOrder([r.id])}>Order</button>
            </div>
          ))
        ) : <div>Ask the AI to get suggestions</div>}
      </div>
    </div>
  );
}
