import { ChatEventEnum, MessageTypes, MsgAckEnums } from "../constants.js";
import { ApiError } from "../utils/ApiError.js";
import Joi from "joi";
import { pubSubPublisher, redisCache } from "../utils/redis.js";
import { redisStreamsAdder } from "../utils/redis.js";
import { getSequenceId, lookupChat } from "../utils/eventUtils.js";
import crypto from "crypto";

const messagePayloadSchema = Joi.object({
  _id: Joi.string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .required(),

  chat: Joi.string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .required(),

  content: Joi.string()
    .min(1)
    .max(2000)
    .required(),

});


const ackPayloadSchema = Joi.object({
  type: Joi.string().required(),
  eventId: Joi.string(),
  messageId: Joi.string().regex(/^[a-fA-F0-9]{24}$/),
  receiverId: Joi.string().regex(/^[a-fA-F0-9]{24}$/),
  receiptType: Joi.string()
});



const messageReceivedEvent = (socket, rateLimiter) => {
  socket.on(ChatEventEnum.SEND_MESSAGE, async (payload) => {
    try {
      await rateLimiter.consume(socket.user._id);
      messagePayloadSchema.validate(payload);

      const lookupChatResult = await lookupChat(payload.chat, socket.user._id);
      const { chatMembers, chatVersion } = lookupChatResult;

      const sequenceId = await getSequenceId(payload.chat);

      if (sequenceId.failed) {
        throw new ApiError(500, "Could not get the sequence id for message");
      }

      if (!chatMembers.length) {
        throw new ApiError(400, "Bad request");
      }

      const message = {
        _id: payload._id,
        sender: socket.user._id,
        content: payload.content,
        chat: payload.chat,
        messageType: MessageTypes.TEXT,
        createdAt: Date.now(),
        sequenceId: Number(sequenceId.result || 0),
      }

      const memoryInboxAddResult = await redisCache.addMessageInMemoryInboxForUser(message, chatMembers, chatVersion);

      const [publishMessageResult, queueToSendResult] = await Promise.all([
        pubSubPublisher.publishMessage(ChatEventEnum.SEND_MESSAGE, message, chatMembers, socket.user._id),
        redisStreamsAdder.queueToSend(message, "message")
      ]);

      if (queueToSendResult.failed) {
        //send back error to the sender through socket
        throw new ApiError(500, "Failed to send message");
      }

      if (!memoryInboxAddResult?.failed && !publishMessageResult?.failed && !queueToSendResult.failed) {
        const msgAckEventPayload = {
          messageId: message._id,
          ackType: MsgAckEnums.SENT,
          intendedParticipantCount: chatMembers?.length && (chatMembers.length - 1),
          sequenceIdAssigned: message.sequenceId,
          senderId: socket.user._id
        }

        await redisCache.addMsgAckInMemoryForSender(msgAckEventPayload, "", socket.user._id);

        socket.emit(ChatEventEnum.MSG_ACK_EVENT, msgAckEventPayload);
        await redisStreamsAdder.queueToSend({ ...msgAckEventPayload, senderId: socket.user._id }, "msg_ack");

      }


    } catch (error) {
      console.log("Error occured: ", error);
      let errorMessage;
      if (error.isJoi || error.statusCode === 400) {
        errorMessage = "Bad request";
      } else if (error.msBeforeNext) {
        errorMessage = "Too many requests";
      } else if (error.responses?.length === 0) {
        errorMessage = "Socket not initialized";
      } else {
        errorMessage = `Something went wrong: ${error}`;
      }

    }
  });
}

const msgAckEvent = async (socket, rateLimiter) => {
  socket.on(ChatEventEnum.MSG_ACK_EVENT, async (payload) => {
    try {
      await rateLimiter.consume(socket.user._id,);
      ackPayloadSchema.validate(payload);


      const { senderId, messageId, ackType } = payload;

      const messageHash = await redisCache.getMessageHash(messageId);

      if (messageHash.result && (messageHash.result.sender === senderId)) {
        const memberIndex = await redisCache.getMemberPosForBitMap(messageHash.result.chat, socket.user?._id, messageHash.result.chatVersion);

        if (memberIndex.failed) {
          throw new ApiError(404, "Receiver not found in chat members");
        }

        const updateToAckResult = await redisCache.updateMemberToAcked(messageId, Number(memberIndex.result));
        const updateMemoryInboxResult = await redisCache.deleteMessageInMemoryInboxForUser(messageId, socket.user?._id);

        if ((await updateToAckResult).failed || (await updateMemoryInboxResult).failed) {
          throw new ApiError(500, "Could not process acknowledgement");
        }
      }

      const messageToSend = {
        messageId,
        receiverId: socket.user?._id,
        timeOfAck: Date.now(),
        ackType: ackType,
        senderId
      }

      const memoryInboxAddResult = await redisCache.addMsgAckInMemoryForSender(messageToSend, socket.user._id, senderId);

      const [publishMessageResult, queueToSendResult] = await Promise.all([
        pubSubPublisher.publishMessage(ChatEventEnum.MSG_ACK_EVENT, messageToSend, [senderId]),
        redisStreamsAdder.queueToSend(messageToSend, "msg_ack")
      ]);


      if (!memoryInboxAddResult?.failed && !publishMessageResult?.failed && !queueToSendResult?.failed) {
        socket.emit(ChatEventEnum.PROCESSED_MSG_ACK_EVENT, payload.messageId);
      }

    } catch (error) {
      console.log("Error occured: ", error);
      let errorMessage;
      if (error.isJoi || error.statusCode === 400) {
        errorMessage = "Bad request";
      } else if (error.msBeforeNext) {
        errorMessage = "Too many requests";
      } else if (error.responses?.length === 0) {
        errorMessage = "Socket not initialized";
      } else {
        errorMessage = `Something went wrong: ${error}`;
      }
    }
  });
}


const ackEvent = async (socket, rateLimiter) => {
  socket.on(ChatEventEnum.ACK_EVENT, async (payload) => {
    try {
      await rateLimiter.consume(socket.user._id,);
      ackPayloadSchema.validate(payload);

      if (payload.type === "receivedMessageReceiptAck") {
        const { messageId, receiverId, receiptType } = payload;
        const entryId = crypto
          .createHash('sha256')
          .update(`${messageId}:${receiptType}:${receiverId ?? ""}`)
          .digest("base64");

        const msgAckHash = await redisCache.getMsgAckHash(entryId);

        if (msgAckHash.result?.senderId !== socket.user._id) {
          throw new ApiError(403, "Client cannot acknowledge this event");
        }

        await redisCache.updateMemberToAckedForMsgAck(entryId);
        await redisCache.deleteMsgAckInMemoryForSender(entryId, socket.user?._id);

      } else {
        const eventId = payload.eventId;
        const notificationHash = await redisCache.getNotificationHash(eventId);
        let memberIndex;
        if (notificationHash.result?.chat) {
          memberIndex = await redisCache.getMemberPosForBitMap(notificationHash.result.chat, socket.user?._id, notificationHash.result.chatVersion);
        } else {
          memberIndex = await redisCache.getTempReceiverPosForBitMap(eventId, socket.user?._id);
        }

        if (memberIndex.failed || !memberIndex.result) {
          throw new ApiError(404, "Receiver not found in chat members");
        }

        const updateToAckResult = redisCache.updateMemberToAckedForNotification(eventId, memberIndex.result);
        const updateMemoryResult = redisCache.deleteNotificationInMemoryForUser(eventId, socket.user?._id);

        if ((await updateToAckResult).failed || (await updateMemoryResult).failed) {
          throw new ApiError(500, "Could not process acknowledgement");
        }

      }


    } catch (error) {
      console.log("Error occured: ", error);
      let errorMessage;
      if (error.isJoi || error.statusCode === 400) {
        errorMessage = "Bad request";
      } else if (error.msBeforeNext) {
        errorMessage = "Too many requests";
      } else if (error.responses?.length === 0) {
        errorMessage = "Socket not initialized";
      } else {
        errorMessage = `Something went wrong: ${error}`;
      }
    }
  });
}

export { messageReceivedEvent, ackEvent, msgAckEvent }
