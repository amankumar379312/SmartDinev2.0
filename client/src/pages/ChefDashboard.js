import React, { useEffect, useState } from 'react';
import API from '../api';
import useSocket from '../hooks/useSocket';

export default function ChefDashboard() {
  const [orders, setOrders] = useState([]);
  const socketRef = useSocket();

  useEffect(()=> {
    fetchOrders();
    const s = socketRef.current;
    if (!s) return;
    s.on('orderCreated', ()=> fetchOrders());
    s.on('orderAccepted', ()=> fetchOrders());
    s.on('orderUpdated', ()=> fetchOrders());
    return ()=> { s?.off('orderCreated'); s?.off('orderAccepted'); s?.off('orderUpdated'); }
  }, []);

  async function fetchOrders() {
    const res = await API.get('/orders');
    setOrders(res.data);
  }

  async function accept(id) {
    await API.post(`/orders/accept/${id}`);
    fetchOrders();
  }

  return (
    <div>
      <h2>Chef Dashboard</h2>
      {orders.map(o => (
        <div key={o._id} style={{border:'1px solid #ddd', padding:8, margin:8}}>
          <div>Order: {o._id} Table: {o.table?.number}</div>
          <div>Status: {o.status}</div>
          <div>
            {o.items.map(it => <div key={it._id}>{it.menuItem.name} x{it.qty}</div>)}
          </div>
          {o.status === 'created' && <button onClick={()=>accept(o._id)}>Accept</button>}
        </div>
      ))}
    </div>
  );
}
