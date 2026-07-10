import { io } from "socket.io-client";
import { refreshTokenAndConnectSocket } from "../utils";
import { ChatEventEnum } from "../constants";
import store from "../store/store";
import { updateOtherUserPresence } from "../store/otherUserPresenceSlice";

const SOCKET_HEARTBEAT_INTERVAL_MS = 3 * 1000;

export const socketInstance = io(import.meta.env.VITE_SOCKET_URI, {
  withCredentials: true,
  autoConnect: false
});

let socketHeartbeatInterval;

socketInstance.on("connect", () => {
  console.log("socket connected");

  setInterval(() => {
    const currentStoreStatus = store.getState();
    const currentOtherUserOnlineStatus = currentStoreStatus.otherUserPresence;
    socketInstance.emit(ChatEventEnum.HEARTBEAT, currentOtherUserOnlineStatus);
  }, SOCKET_HEARTBEAT_INTERVAL_MS);

});

socketInstance.on("connect_error", error => {
  console.log("socket connect error occured: ", error);
  if (error.data?.statusCode === 401) {
    refreshTokenAndConnectSocket(socketInstance);
  }
});

socketInstance.on(ChatEventEnum.OTHER_MEMBER_PRESENCE, payload => {
  store.dispatch(updateOtherUserPresence(payload));
});

socketInstance.on(ChatEventEnum.DISCONNECT_EVENT, () => {
  clearInterval(socketHeartbeatInterval);
});
