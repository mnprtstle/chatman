import mongoose from "mongoose";
import "dotenv/config";
import { gfsBucket, gfsBucketVoice } from "../db/index.js"
import { Readable } from "stream";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ChatMessage } from "../models/message.model.js";
import { Chat } from "../models/chat.model.js";
import { ChatEventEnum, FILE_QTY_LIMIT, MAX_FILE_SIZE, MAX_PHOTO_SIZE, MAX_VOICE_SIZE, MessageTypes, MsgAckEnums } from "../constants.js";
import { pubSubPublisher, redisCache, redisStreamsAdder } from "../utils/redis.js";
import { getSequenceId, validateMimeType } from "../utils/helpers.js";
import busboy from "busboy";
import Joi from "joi";

const conn = mongoose.connection;

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

  fileType: Joi.string()

});


const uploadFile = asyncHandler(async (req, res, next) => {
  const fileType = req.params.fileType;
  let fileSizeLimit = (fileType === MessageTypes.VOICE) ? MAX_VOICE_SIZE : (fileType === MessageTypes.IMAGE) ? MAX_PHOTO_SIZE : MAX_FILE_SIZE;
  let uploadedName;
  let chatExists;
  const bucket = (fileType === MessageTypes.VOICE) ? gfsBucketVoice : gfsBucket;
  const formData = {};

  const bb = busboy({
    headers: req.headers,
    limits: {
      fileSize: fileSizeLimit,
      files: FILE_QTY_LIMIT
    }
  });

  const uploadPromises = [];
  let hasErrored = false;
  const activeStreamIds = [];

  bb.on('field', (fieldname, val, info) => {
    formData[fieldname] = val;
    if (fieldname === "_id") {
      req.messageId = val;
    }
  });

  bb.on('filesLimit', async () => {
    if (!hasErrored) {
      hasErrored = true;

      req.unpipe(bb);

      for (const id of activeStreamIds) {
        try {
          if (bucket) {
            await bucket.delete(id);
          }
        } catch (cleanupErr) {
          console.error('Failed to clean up file after filesLimit:', cleanupErr);
        }
      }

      res.status(400).send('Maximum of 1 file allowed per request.');
    }
  });

  bb.on('file', async (name, file, info) => {
    try {

      if (hasErrored) {
        file.resume();
        return;
      }

      const { filename, mimeType } = info;



      const validationResult = validateMimeType(mimeType);

      if (!validationResult.isValid) {
        file.resume(); // Discard stream
        throw new ApiError(404, "File type not allowed.");
      }

      messagePayloadSchema.validate({ ...formData, chat: req.params.chatId, fileType });

      chatExists = await Chat.findOne({
        _id: req.params.chatId, participants: req.user._id
      });

      if (!chatExists) {
        throw new ApiError(404, "Chat not found or user not authorized");
      }

      if (!bucket) {
        throw new ApiError(500, "Bucket not initialized, please try again");
      }

      const extensionName = info.filename?.split(".")?.pop() || "";
      uploadedName = (fileType === MessageTypes.VOICE) ? `${formData._id}_voice.mp3` : (fileType === MessageTypes.IMAGE) ? `${formData._id}_image.webp` : `${formData._id}_file.${extensionName}`;

      const metadata = {
        forChatId: req.params.chatId,
        sender: req.user._id
      }


      const uploadStream = bucket.openUploadStream(uploadedName, {
        contentType: mimeType,
        metadata
      });

      activeStreamIds.push(uploadStream.id);

      const streamPromise = new Promise((resolve, reject) => {
        uploadStream.on('finish', () => {
          resolve({ fileId: uploadStream.id, filename });
        });

        uploadStream.on('error', (err) => {
          if (!hasErrored) {
            hasErrored = true;
            req.unpipe(bb);
            next(new ApiError(500, "Error uploading the file"));
          }
          reject(err);
        });
      });

      // 2. LISTEN FOR THE FILE SIZE LIMIT TRIGGER
      file.on('limit', async () => {
        if (!hasErrored) {
          hasErrored = true;

          // Immediately stop feeding network data to Busboy
          req.unpipe(bb);

          // Abort the GridFS upload stream to clean up the partial chunks
          // This prevents orphaned chunks from taking up space in your DB
          try {
            if (bucket) {
              await bucket.delete(uploadStream.id);
            }
          } catch (cleanupErr) {
            console.error('Failed to clean up aborted stream chunks:', cleanupErr);
          }

          next(new ApiError(413, `File "${filename}" exceeds the maximum allowed limit of ${fileSizeLimit}.`))
          return;
        }
      });

      streamPromise.catch(() => { });
      uploadPromises.push(streamPromise);

      file.pipe(uploadStream);

    } catch (error) {
      next(error);
    }

  });

  bb.on('finish', async () => {
    if (hasErrored) return;

    try {
      const results = await Promise.all(uploadPromises);
      if (results.length > 0) {
        const sequenceId = await getSequenceId(chatExists._id, chatExists.lastSequenceId);

        const message = {
          _id: formData._id,
          sender: req.user._id,
          attachmentName: uploadedName,
          chat: req.params.chatId,
          messageType: fileType,
          content: formData.content || "",
          sequenceId: (sequenceId.result || 1),
          createdAt: Date.now()
        }

        if (formData.audioDuration) {
          message.audioDuration = formData.audioDuration;
        }

        const getChatVersionResult = await redisCache.getOrSetAndGetChatVersion(chatExists._id, chatExists.participants);

        if (getChatVersionResult.failed) {
          throw new ApiError(500, "Server error occured, could not load chat");
        }

        const chatVersion = getChatVersionResult.result;

        const memoryInboxAddResult = await redisCache.addMessageInMemoryInboxForUser(message, chatExists.participants, chatVersion);

        if (memoryInboxAddResult.failed) {
          throw new ApiError(500, "Server error occured, could not send message");
        }

        const publishAndQueueResult = await Promise.all([
          pubSubPublisher.publishMessage(ChatEventEnum.SEND_MESSAGE, message, chatExists.participants, req.user._id),
          redisStreamsAdder.queueToSend(message, "message")
        ])

        if (publishAndQueueResult[0]?.failed || publishAndQueueResult[1]?.failed) {
          throw new ApiError(500, "Server error occured, could not send message");
        }

        const msgAckEventPayload = {
          messageId: message._id,
          ackType: MsgAckEnums.SENT,
          intendedParticipantCount: chatExists.participants.length - 1,
          sequenceIdAssigned: message.sequenceId,
          senderId: req.user._id
        }

        await redisCache.addMsgAckInMemoryForSender(msgAckEventPayload, "", req.user._id);
        pubSubPublisher.publishMessage(ChatEventEnum.MSG_ACK_EVENT, msgAckEventPayload, [req.user._id]);
        redisStreamsAdder.queueToSend({ ...msgAckEventPayload, senderId: req.user._id }, "msg_ack");

        return res
          .status(201)
          .json(
            new ApiResponse(
              201,
              {},
              "File uploaded successfully"
            )
          );

      } else {
        throw new ApiError(400, "No valid files uploaded");
      }

    } catch (err) {

      if (!hasErrored) {
        next(err);
      }
    }
  });

  req.pipe(bb);

});


const sendFailedToSendOnError = asyncHandler(async (err, req, res, next) => {
  if (req.messageId) {
    const notifyingMessage = {
      messageId: `${req.messageId}_failed`,
      noNotifyingMessage: true
    }

    const messageToSend = {
      notifyingMessage,
      failedMessageId: req.messageId
    }

    await redisCache.addNotificationInMemoryForUser({
      messageToSend,
      notificationType: ChatEventEnum.FAILED_MESSAGE,
    },
      [req.user._id]);

    pubSubPublisher.publishMessage(ChatEventEnum.FAILED_MESSAGE, messageToSend, [req.user._id]);
    redisStreamsAdder.queueToSend({
      _id: notifyingMessage._id
    }, "notification");

  }

  next(err);
})




const uploadFile2 = asyncHandler(async (req, res, next) => {

  const fileType = req.body?.fileType;

  if (!req.file) {
    throw new ApiError(404, "File not found");
  }

  const chatExists = await Chat.findOne({
    _id: req.params.chatId, participants: req.user._id
  });

  if (!chatExists) {
    throw new ApiError(404, "Chat not found or user not authorized");
  }

  if (!gfsBucket) {
    throw new ApiError(500, "Bucket not initialized, please try again");
  }

  const readableStream = Readable.from(req.file.buffer);

  const uploadedName = (fileType === MessageTypes.IMAGE) ? `${Date.now()}-image-${req.file.originalname}` : `${Date.now()}-file-${req.file.originalname}`;

  const uploadStream = gfsBucket.openUploadStream(uploadedName, {
    contentType: req.file.mimetype
  });

  readableStream.pipe(uploadStream)
    .on('error', (err) => {
      console.log("Download failed: ", err)
      next(new ApiError(500, "Upload failed"));
    })
    .on("finish", async () => {

      try {
        const sequenceId = await getSequenceId(chatExists._id, chatExists.lastSequenceId);

        const message = {
          _id: req.body._id,
          sender: req.user._id,
          attachmentName: uploadedName,
          chat: req.params.chatId,
          messageType: fileType,
          content: req.body?.content || "",
          sequenceId: (sequenceId.result || 1),
        }

        const getChatVersionResult = await redisCache.getOrSetAndGetChatVersion(chatExists._id, chatExists.participants);

        if (getChatVersionResult.failed) {
          throw new ApiError(500, "Server error occured, could not load chat");
        }

        const chatVersion = getChatVersionResult.result;

        const memoryInboxAddResult = await redisCache.addMessageInMemoryInboxForUser(message, chatExists.participants, chatVersion);

        if (memoryInboxAddResult.failed) {
          throw new ApiError(500, "Server error occured, could not send message");
        }

        const publishMessageResult = await pubSubPublisher.publishMessage(ChatEventEnum.SEND_MESSAGE, message, chatExists.participants, req.user._id);

        if (publishMessageResult.failed) {
          throw new ApiError(500, "Server error occured, could not send message");
        }

        const queueToSendResult = await redisStreamsAdder.queueToSend(message, "message");

        if (queueToSendResult.failed) {
          throw new ApiError(500, "Server error occured, could not send message");
        }


        return res
          .status(201)
          .json(
            new ApiResponse(
              201,
              message,
              "File uploaded successfully"
            )
          );

      } catch (error) {
        next(error);
      }
    });
});

const getFile = asyncHandler(async (req, res, next) => {
  const isVoiceFile = req.params?.voice === "y" ? true : false;
  const downloadOnDevice = req.params?.download === "y" ? true : false;
  const bucket = req.params?.voice === "y" ? gfsBucketVoice : gfsBucket;
  const fileDoc = isVoiceFile ? (await conn.db.collection('voices.files').findOne({ filename: req.params.attachmentName })) : (await conn.db.collection('fs.files').findOne({ filename: req.params.attachmentName }));

  if (!fileDoc) {
    throw new ApiError(404, "File not found");
  }

  const chat = await Chat.findOne({ _id: fileDoc.metadata?.forChatId, participants: req.user._id });

  if (!chat) {
    throw new ApiError(401, "User not authorized");
  }

  const downloadStream = bucket.openDownloadStreamByName(req.params.attachmentName);
  downloadStream.on("file", (file) => {
    try {
      res.set('Content-Type', file.contentType);
      res.set('Content-Disposition', `${downloadOnDevice ? "attachment" : "inline"}; filename="${file.filename}"`);
    } catch (error) {
      next(error)
    }
  });
  downloadStream.on('error', (error) => {
    console.log("Error downloading file: ", error)
    throw new ApiError(500, "Error downloading file")
  });

  downloadStream.pipe(res);


});



const deleteFile = asyncHandler(async (req, res) => {
  const { chatId, messageId } = req.params;

  const chatExists = await Chat.findOne({ _id: chatId, participants: req.user._id });

  if (!chatExists) {
    throw new ApiError(403, "User not authorized to perform this action");
  }


  const messageExisted = await ChatMessage.findOneAndUpdate({
    _id: messageId,
    chat: chatId,
    sender: req.user._id,
  }, {
    $set: {
      content: "",
      messageType: MessageTypes.DELETED
    }
  });

  if (messageExisted) {

    if (messageExisted.messageType === MessageTypes.FILE || messageExisted.messageType === MessageTypes.IMAGE) {
      const fileDoc = await conn.db.collection('fs.files').findOne({ filename: messageExisted.attachmentName });

      if (!fileDoc) {
        throw new ApiError(500, "Error deleting file");
      }

      await gfsBucket.delete(fileDoc._id);

    } else {
      const voiceDoc = await conn.db.collection('voices.files').findOne({ filename: messageExisted.attachmentName });

      if (!voiceDoc) {
        throw new ApiError(500, "Error deleting voice");
      }

      await gfsBucketVoice.delete(voiceDoc._id);
    }
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



export {
  uploadFile,
  sendFailedToSendOnError,
  getFile,
  deleteFile,
}
