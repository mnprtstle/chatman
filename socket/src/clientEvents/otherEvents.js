import { ChatEventEnum, ChatStatusEnum } from "../constants.js";
import { lookupChat } from "../utils/eventUtils.js";
import { pubSubPublisher, redisCache } from "../utils/redis.js";
import axios from "axios";


const heartbeatEvent = socket => {
  socket.on(ChatEventEnum.HEARTBEAT, async (data) => {
    try {
      await redisCache.updateUserPresence(socket.user?._id);
      if (!data?.id) return;

      const checkPresenceResult = await redisCache.checkUserPresence(data.id);
      let onlineField;
      let lastSeenField;

      if (checkPresenceResult.failed) {
        onlineField = ChatStatusEnum.UNKNOWN;
        lastSeenField = null;

      } else if (!checkPresenceResult.result) {
        if ((data.online === ChatStatusEnum.OFFLINE) && data.lastSeen) return;
        const lastSeenTime = await axios.get(`${process.env.BACKEND_URL}/api/v1/ws/last_seen/${data.id}`, {
          headers: {
            'Authorization': process.env.SOCKET_BACKEND_KEY
          }
        });

        onlineField = ChatStatusEnum.OFFLINE;
        lastSeenField = lastSeenTime.data.data?.lastOnline;

      } else {
        const lastSeenTime = checkPresenceResult.result;
        onlineField = (Date.now() > (lastSeenTime + (25 * 1000))) ? ChatStatusEnum.OFFLINE : ChatStatusEnum.ONLINE;
        lastSeenField = (Date.now() > lastSeenTime + (25 * 1000)) ? new Date(lastSeenTime) : null;
      }


      socket.emit(ChatEventEnum.OTHER_MEMBER_PRESENCE, {
        id: data.id,
        online: onlineField,
        lastSeen: lastSeenField
      });

    } catch (error) {
      console.log("heartBeatEvent failed: ", error);
    }

  });
}


//when the user is typing
const ParticipantTypingEvent = (socket) => {
  socket.on(ChatEventEnum.TYPING_EVENT, async (chatId) => {
    try {
      const { chatMembers, chatVersion: _ } = await lookupChat(chatId, socket.user._id);
      if (!chatMembers?.length) return;
      const messageToSend = { userId: socket.user?._id.toString(), chatId }
      pubSubPublisher.publishMessage(ChatEventEnum.TYPING_EVENT, messageToSend, chatMembers, socket.user._id);
    } catch (error) {
      console.log("participantTypingEvent failed: ", error);
    }

  });
};

//when the user stops typing
const ParticipantStoppedTypingEvent = (socket) => {
  socket.on(ChatEventEnum.STOP_TYPING_EVENT, async (chatId) => {
    try {
      const { chatMembers, chatVersion: _ } = await lookupChat(chatId, socket.user._id);
      if (!chatMembers?.length) return;
      const messageToSend = { userId: socket.user?._id.toString(), chatId }
      pubSubPublisher.publishMessage(ChatEventEnum.STOP_TYPING_EVENT, messageToSend, chatMembers, socket.user._id);

    } catch (error) {
      console.log("participantTypingEvent failed: ", error);
    }
  });
};


export {
  heartbeatEvent,
  ParticipantTypingEvent,
  ParticipantStoppedTypingEvent,
}
