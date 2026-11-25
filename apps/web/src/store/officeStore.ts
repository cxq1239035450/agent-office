import { create } from 'zustand';
import type { AgentRuntimeState, OfficeEvent, RoomConfig } from '@agent-office/shared';

interface OfficeStore {
  rooms: RoomConfig[];
  selectedRoomId: string | null;
  selectedAgentId: string | null;
  agentStates: Record<string, AgentRuntimeState>;
  recentEvents: OfficeEvent[];
  setRooms: (rooms: RoomConfig[]) => void;
  upsertRoom: (room: RoomConfig) => void;
  removeRoomLocal: (roomId: string) => void;
  selectRoom: (roomId: string | null) => void;
  selectAgent: (roomId: string, agentId: string | null) => void;
  pushEvent: (event: OfficeEvent) => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  rooms: [],
  selectedRoomId: null,
  selectedAgentId: null,
  agentStates: {},
  recentEvents: [],
  setRooms: (rooms) =>
    set((state) => {
      const stillExists = rooms.some((r) => r.id === state.selectedRoomId);
      return {
        rooms,
        selectedRoomId: stillExists ? state.selectedRoomId : (rooms[0]?.id ?? null),
      };
    }),
  upsertRoom: (room) =>
    set((state) => {
      const exists = state.rooms.some((r) => r.id === room.id);
      return {
        rooms: exists
          ? state.rooms.map((r) => (r.id === room.id ? room : r))
          : [...state.rooms, room],
      };
    }),
  removeRoomLocal: (roomId) =>
    set((state) => {
      const nextRooms = state.rooms.filter((r) => r.id !== roomId);
      return {
        rooms: nextRooms,
        selectedRoomId:
          state.selectedRoomId === roomId
            ? (nextRooms[0]?.id ?? null)
            : state.selectedRoomId,
        selectedAgentId:
          state.selectedRoomId === roomId ? null : state.selectedAgentId,
      };
    }),
  selectRoom: (selectedRoomId) =>
    set({ selectedRoomId, selectedAgentId: null }),
  selectAgent: (roomId, agentId) =>
    set({ selectedRoomId: roomId, selectedAgentId: agentId }),
  pushEvent: (event) =>
    set((state) => {
      const key = `${event.roomId}:${event.agentId}`;
      return {
        agentStates: {
          ...state.agentStates,
          [key]: {
            roomId: event.roomId,
            agentId: event.agentId,
            status: event.status,
            taskId: event.taskId,
            approvalId: event.approvalId,
            bubbleText: event.bubbleText,
            worktreeBranch: event.worktreeBranch,
            lastUpdated: event.timestamp,
          },
        },
        recentEvents: [event, ...state.recentEvents].slice(0, 80),
      };
    }),
}));
