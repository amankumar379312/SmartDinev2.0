import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { resolveSocketBaseUrl } from '../utils/runtimeConfig';

export default function useSocket() {
  const socketRef = useRef(null);
  useEffect(() => {
    socketRef.current = io(resolveSocketBaseUrl());
    return () => socketRef.current?.disconnect();
  }, []);
  return socketRef;
}
