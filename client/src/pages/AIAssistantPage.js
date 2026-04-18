import React from 'react';
import { useLocation } from 'react-router-dom';
import AIAssistant from '../components/AIAssistant';

export default function AIAssistantPage() {
  const { state } = useLocation();
  const table = state?.table;

  if (!table) return <div>No table selected</div>;

  return (
    <div>
      <h2>Table {table.number}</h2>
      <AIAssistant tableId={table._id} onOrderPlaced={o => alert('Order placed: '+o._id)} />
    </div>
  );
}
