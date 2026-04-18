import React, { useEffect, useState, useContext } from 'react';
import API from '../api';
import TableGrid from '../components/TableGrid';
import AIAssistant from '../components/AIAssistant';
import useSocket from '../hooks/useSocket';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom'; // for navigation

export default function TableMap() {
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(null);
  const socketRef = useSocket();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(()=> {
    async function load() {
      const res = await API.get('/tables');
      setTables(res.data);
    }
    load();

    const socket = socketRef.current;
    if (!socket) return;
    socket.on('tableHeld', data => setTables(prev => prev.map(t => t._id===data.tableId ? {...t, status:'held'} : t)));
    socket.on('tableOccupied', data => setTables(prev => prev.map(t => t._id===data.tableId ? {...t, status:'occupied'} : t)));
    socket.on('tableReleased', data => setTables(prev => prev.map(t => t._id===data.tableId ? {...t, status:'available'} : t)));
    
    return () => {
      socket.off('tableHeld'); socket.off('tableOccupied'); socket.off('tableReleased');
    };
  }, []);

  async function onSelectTable(t) {
    if (t.status !== 'available') return alert('Table not available');
    const res = await API.post(`/tables/hold/${t._id}`);
    setSelected(res.data);

    // Navigate to AIAssistant page with tableId as state
    navigate('/ai-assistant', { state: { table: res.data } });
  }

  return (
    <div style={{padding:20}}>
      <h2>Welcome {user?.name || 'Guest'}</h2>
      <TableGrid tables={tables} onSelect={onSelectTable} />
      
      {/* Optional inline assistant */}
      {selected && (
        <div style={{marginTop:20}}>
          <h4>At Table {selected.number}</h4>
          <AIAssistant tableId={selected._id} onOrderPlaced={(o)=>alert('Order placed: '+o._id)} />
          <button onClick={async ()=>{
            await API.post(`/tables/occupy/${selected._id}`);
            setSelected(null);
          }}>I have arrived</button>
        </div>
      )}
    </div>
  );
}
