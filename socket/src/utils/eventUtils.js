import axios from "axios";
import { redisCache } from "./redis.js";

export const lookupChat = async (chatId, senderId) => {
  // check in redis, if no data in redis, check in db with http request 
  let senderIsMember, chatMembers;
  const cacheResult = await redisCache.validateChat(chatId, senderId);
  senderIsMember = cacheResult.senderIsMember;
  chatMembers = cacheResult.chatMembers;
  const currentChatVersion = cacheResult.currentChatVersion || 1;

  if (!senderIsMember || !chatMembers.length) {
    const response = await axios.post(`${process.env.BACKEND_URL}/api/v1/ws/validate_sender`, {
      chatId, senderId
    }, {
      headers: {
        'Authorization': process.env.SOCKET_BACKEND_KEY
      }
    });

    senderIsMember = response.data.data.senderIsMember;
    chatMembers = response.data.data.chatMembers;

    if (!senderIsMember || !chatMembers.length) {
      return { chatMembers: [], chatVersion: currentChatVersion };
    }

    await redisCache.setMembersOfChat(chatId, chatMembers, currentChatVersion);

  }

  return { chatMembers, chatVersion: currentChatVersion };

}

export const getSequenceId = async chatId => {
  const sequenceIdInRedis = await redisCache.getAndUpdateSequenceId(chatId);

  if (sequenceIdInRedis?.result) {
    return sequenceIdInRedis;
  } else {
    const resultFromDb = await axios.get(`${process.env.BACKEND_URL}/api/v1/ws/get_sequence_id/${chatId}`, {
      headers: {
        'Authorization': process.env.SOCKET_BACKEND_KEY
      }
    });

    const lastSequenceIdFromDb = resultFromDb.data?.data?.lastSequenceId;
    const sequenceIdUpdateInRedisAfterUpdate = await redisCache.getOrAddSequenceId(chatId, (lastSequenceIdFromDb || 0) + 1);

    return sequenceIdUpdateInRedisAfterUpdate;
  }

}
