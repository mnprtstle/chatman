import mongoose from "mongoose";
import { ChatEventEnum, MessageTypes, MsgAckEnums } from "../constants.js";
import { Chat } from "../models/chat.model.js";
import { ChatMessage } from "../models/message.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pubSubPublisher, redisStreamsAdder, redisCache } from "../utils/redis.js";
import { getSequenceId } from "../utils/helpers.js";
import { Notification } from "../models/notification.model.js";
import crypto from "crypto";
import { gfsBucket, gfsBucketVoice } from "../db/index.js";

const conn = mongoose.connection;


const deleteMessage = asyncHandler(async (req, res) => {
  const { chatId, messageId } = req.params;

  const { messagetype: messageType, attachmentname: attachmentName } = req.query;

  const bucket = messageType ? (messageType === MessageTypes.VOICE ? gfsBucketVoice : gfsBucket) : null;
  let fileDoc

  if (bucket) {
    fileDoc = (messageType === MessageTypes.VOICE) ? (
      await conn.db.collection('voices.files').findOne({ filename: attachmentName })
    ) : (
      await conn.db.collection('fs.files').findOne({ filename: attachmentName })
    );

  }

  if (fileDoc) {
    if (fileDoc.metadata?.sender !== req.user._id) {
      throw new ApiError(403, "User not authorized to perform this action");
    }
  }

  const message = await ChatMessage.findOne({
    _id: messageId,
    chat: fileDoc?.forChatId || chatId,
    sender: req.user._id,
  });


  const chatExists = await Chat.findOne({ _id: fileDoc?.forChatId || chatId, participants: req.user._id });

  if (!chatExists) {
    throw new ApiError(403, "User not authorized to perform this action");
  }

  if (message) {
    await ChatMessage.findOneAndUpdate({
      _id: messageId,
      chat: fileDoc?.forChatId || chatId,
      sender: req.user._id,
    }, {
      $set: {
        content: "",
        messageType: MessageTypes.DELETED
      }
    }, { new: true });
  }

  if (fileDoc) {
    await bucket.delete(fileDoc._id);
  }

  const notifyingMessage = {
    _id: `${messageId}_${chatId}_${req.user._id}_deleted`,
    noNotifyingMessage: true
  }

  const messageToSend = {
    deletedMessageId: messageId,
    deletedMessageChat: chatId,
    deletedMessageSender: req.user._id,
    notifyingMessage
  }

  const getChatVersionResult = await redisCache.getOrSetAndGetChatVersion(chatId, chatExists.participants);

  if (getChatVersionResult.failed) {
    throw new ApiError(500, "Server error occured, could not load chat");
  }

  const chatVersion = getChatVersionResult.result;

  await redisCache.addNotificationInMemoryForUser({
    messageToSend,
    notificationType: ChatEventEnum.MESSAGE_DELETE_EVENT,
    chatId: chatExists._id,
    excludeIds: [req.user._id]
  }, chatExists.participants, chatVersion);

  pubSubPublisher.publishMessage(
    ChatEventEnum.MESSAGE_DELETE_EVENT,
    messageToSend,
    chatExists.participants,
    req.user._id
  );

  redisStreamsAdder.queueToSend({
    _id: notifyingMessage._id
  }, "notification");


  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Message deleted successfully"));
});


const sendMessageForUnverifiedChat = asyncHandler(async (req, res) => {
  const { messagePayload, receiverId, chatCreationTime } = req.body;

  let chatLookupRetries = 0;

  async function attempt() {
    try {
      const existingChat = await Chat.findOne({ participants: { $all: [receiverId, req.user._id] }, isGroupChat: false, isDeleted: false }).select("_id lastSequenceId revision");

      if (!existingChat) {
        // if a chat doesn't exist yet, wait for a while and try again
        if (chatLookupRetries < 1) {
          chatLookupRetries++;
          setTimeout(attempt, 2000);
        } else {
          throw new Error("Looks like the chat does not exist");
        }

      } else {
        const sequenceId = await getSequenceId(existingChat._id, existingChat.lastSequenceId);

        const message = {
          _id: messagePayload._id,
          chat: existingChat._id.toString(),
          content: messagePayload.content,
          sender: req.user._id,
          messageType: MessageTypes.TEXT,
          createdAt: Date.now(),
          sequenceId: Number(sequenceId.result || 1)
        }

        await redisCache.addMessageInMemoryInboxForUser(message, [receiverId], "1");

        pubSubPublisher.publishMessage(ChatEventEnum.SEND_MESSAGE, message, [receiverId]);

        const queueToSendResult = await redisStreamsAdder.queueToSend(message, "message");

        if (queueToSendResult.failed) {
          throw new Error("queueToSend failed");
        }

        const messageToSend = {
          messageId: message._id,
          ackType: MsgAckEnums.SENT,
          intendedParticipantCount: 1,
          sequenceIdAssigned: message.sequenceId,
          senderId: req.user._id
        }

        await redisCache.addMsgAckInMemoryForSender(messageToSend, "", req.user._id);

        pubSubPublisher.publishMessage(ChatEventEnum.MSG_ACK_EVENT, messageToSend, [req.user._id]);

        await redisStreamsAdder.queueToSend({ ...messageToSend, senderId: req.user._id }, "msg_ack");

        if (Date.now() - new Date(chatCreationTime).getTime() > 10000) {
          const notifyingMessageForVerifiedChat = {
            _id: `${existingChat._id}_verified`,
            noNotifyingMessage: true
          }

          const messageToSendForVerifiedChat = {
            notifyingMessage: notifyingMessageForVerifiedChat,
            chatId: existingChat._id,
            oldId: messagePayload.chat,
            chatRevision: existingChat.revision
          }

          await redisCache.addNotificationInMemoryForUser({
            messageToSend: messageToSendForVerifiedChat,
            notificationType: ChatEventEnum.VERIFIED_1_1_CHAT,
          }, [req.user._id], '1');

          pubSubPublisher.publishMessage(ChatEventEnum.VERIFIED_1_1_CHAT, messageToSendForVerifiedChat, [req.user._id])

          redisStreamsAdder.queueToSend({
            _id: notifyingMessageForVerifiedChat._id
          }, "notification");

        }

        return res
          .status(200)
          .json(
            new ApiResponse(200, {}, "Request completed")
          );
      }

    } catch (error) {

      return res
        .status(500)
        .json(
          new ApiResponse(500, {}, "Could not send message")
        );
    }
  }

  attempt();

});

const ackEvent = asyncHandler(async (req, res) => {
  let bulkOperations;
  if (req.body.type === "receivedMessageReceiptAck") {
    const { messageId, receiverId, receiptType } = req.body;

    const entryId = crypto
      .createHash('sha256')
      .update(`${messageId}: ${receiptType}: ${receiverId ?? ""} `)
      .digest("base64");


    bulkOperations = [
      {
        deleteOne: {
          filter: { receivingUsers: [req.user._id], _id: entryId }
        }
      },
      {
        updateMany: {
          filter: {
            _id: entryId,
            receivingUsers: req.user._id,
            "receivingUsers.1": { $exists: true }
          },
          update: { $pull: { receivingUsers: req.user._id } }
        }
      }
    ];


  } else {
    const { eventId } = req.body;

    bulkOperations = [
      {
        deleteOne: {
          filter: { receivingUsers: [req.user._id], _id: eventId }
        }
      },
      {
        updateMany: {
          filter: {
            _id: eventId,
            receivingUsers: req.user._id,
            "receivingUsers.1": { $exists: true }
          },
          update: { $pull: { receivingUsers: req.user._id } }
        }
      }
    ];
  }

  await Notification.bulkWrite(bulkOperations);

  return res
    .status(200)
    .json(
      new ApiResponse(200, {}, "Ack processed successfully")
    );
});

const msgAckEvent = asyncHandler(async (req, res) => {
  const { messageId, senderId, ackType } = req.body;

  const bulkOperations = [
    {
      deleteOne: {
        filter: { receivingUsers: [req.user._id], _id: messageId, sender: senderId }
      }
    },
    {
      updateMany: {
        filter: {
          _id: messageId,
          sender: senderId,
          receivingUsers: req.user._id,
          "receivingUsers.1": { $exists: true }
        },
        update: { $pull: { receivingUsers: req.user._id } }
      }
    }
  ];


  await ChatMessage.bulkWrite(bulkOperations);

  const messageToSend = {
    messageId,
    receiverId: req.user?._id,
    timeOfAck: Date.now(),
    ackType: ackType,
    senderId
  }

  const addMsgAckInMemoryResult = await redisCache.addMsgAckInMemoryForSender(messageToSend, req.user._id, senderId);

  if (addMsgAckInMemoryResult.failed) {
    throw new ApiError(500, "Failed to process message ack");
  }

  const publishMessageResult = pubSubPublisher.publishMessage(ChatEventEnum.MSG_ACK_EVENT, messageToSend, [senderId]);
  const queueToSendResult = redisStreamsAdder.queueToSend(messageToSend, "msg_ack");

  if ((await publishMessageResult).failed || (await queueToSendResult).failed) {
    throw new ApiError(500, "Failed to process message ack");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, {}, "Message ack processed successfully")
    );

});

export {
  deleteMessage,
  sendMessageForUnverifiedChat,
  ackEvent,
  msgAckEvent
};
