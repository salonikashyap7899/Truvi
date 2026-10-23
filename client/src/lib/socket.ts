import { io, Socket } from "socket.io-client";
import { useEffect, useRef } from "react";
import { API_BASE } from "./api";
import { useAuthStore } from "@/store/authStore";

let socketInstance: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(): Socket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;

  // Keep one shared connection while Socket.IO is connecting or reconnecting.
  // Replacing it merely because `.connected` is temporarily false can strand
  // another component's event listener on the old socket during page startup.
  if (!socketInstance || socketToken !== token) {
    socketInstance?.disconnect();
    socketToken = token;
    socketInstance = io(API_BASE, { auth: { token }, transports: ["websocket"] });
  }
  return socketInstance;
}

export function disconnectSocket() {
  socketInstance?.disconnect();
  socketInstance = null;
  socketToken = null;
}

/**
 * Subscribe to a socket event for the lifetime of a component. Re-runs the
 * subscription if the access token changes (e.g. after a refresh).
 */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const wrapped = (payload: T) => handlerRef.current(payload);
    socket.on(event, wrapped);
    return () => {
      socket.off(event, wrapped);
    };
  }, [event, accessToken]);
}
