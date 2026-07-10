import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Chat } from "../models/chat.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AvatarSize, ChatEventEnum, MessageTypes } from "../constants.js";
import { gfsBucketDP } from "../db/index.js";
import { Readable } from "stream";
import { pubSubPublisher, redisCache, redisStreamsAdder } from "../utils/redis.js";
import { Notification } from "../models/notification.model.js";
import { getSequenceId, timestampMsConversion } from "../utils/helpers.js";

const conn = mongoose.connection;

const chatCommonAggregation = () => {
  return [
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "participants",
        as: "participants",
        pipeline: [
          {
            $project: {
              fullName: 1,
              avatar: 1
            },
          },
        ],
      },
    }
  ];
};


async function clearNotificationsForUser(userId) {
  try {
    const bulkOperations = [
      {
        deleteMany: {
          filter: { receivingUsers: [userId] }
        }
      },
      {
        updateMany: {
          filter: {
            receivingUsers: userId,
            "receivingUsers.1": { $exists: true }
          },
          update: { $pull: { receivingUsers: userId } }
        }
      }
    ];

    await Notification.bulkWrite(bulkOperations);


  } catch (error) {
    console.log("Could not clear notifications", error);
  }
}


const searchAvailableUsers = asyncHandler(async (req, res) => {
  const users = await User.aggregate([
    {
      $match: {
        _id: {
          $ne: new mongoose.Types.ObjectId(req.user._id), // without logged in user
        },
      },
    },
    ...timestampMsConversion(),
    {
      $project: {
        avatar: 1,
        fullName: 1,
        username: 1,
        lastOnline: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, users, "Users fetched successfully"));
});



const createOrGetAOneOnOneChat = asyncHandler(async (req, res) => {
  const { _id, otherParticipantId } = req.body;

  if (!otherParticipantId) {
    throw new ApiError(404, "receiverId does not exist");
  }

  if (otherParticipantId === req.user._id.toString()) {
    throw new ApiError(400, "You cannot chat with yourself");
  }

  const otherParticipant = await User.findById(otherParticipantId).select("_id");

  if (!otherParticipant) {
    throw new ApiError(404, "otherParticipant does not exist");
  }

  let verifiedChatInfo;

  const alreadyExistingChat = (
    await Chat.find({ participants: { $all: [otherParticipantId, req.user._id] }, isGroupChat: false, isDeleted: false })
  )?.[0];

  if (!alreadyExistingChat) {

    const chatWithIdExists = await Chat.findById(_id);

    if (!chatWithIdExists) {
      const createdChat = await Chat.create({
        _id: _id,
        name: "One on one chat",
        isGroupChat: false,
        isDeleted: false,
        participants: [req.user._id, otherParticipantId],
        admin: req.user._id,
        revision: 4
      });

      verifiedChatInfo = createdChat;

    } else {
      const createdChat = await Chat.create({
        name: "One on one chat",
        isGroupChat: false,
        isDeleted: false,
        participants: [req.user._id, otherParticipantId],
        admin: req.user._id
      });
      verifiedChatInfo = createdChat;

    }

  } else {
    verifiedChatInfo = alreadyExistingChat;
  }

  const notifyingMessageForVerifiedChat = {
    _id: `${verifiedChatInfo._id}_verified`,
    noNotifyingMessage: true
  }

  const messageToSendForVerifiedChat = {
    notifyingMessage: notifyingMessageForVerifiedChat,
    chatId: verifiedChatInfo._id,
    oldId: _id,
    chatRevision: verifiedChatInfo.revision
  }

  await redisCache.addNotificationInMemoryForUser({
    messageToSend: messageToSendForVerifiedChat,
    notificationType: ChatEventEnum.VERIFIED_1_1_CHAT,
  }, [req.user._id]);

  pubSubPublisher.publishMessage(ChatEventEnum.VERIFIED_1_1_CHAT, messageToSendForVerifiedChat, [req.user._id])

  redisStreamsAdder.queueToSend({
    _id: notifyingMessageForVerifiedChat._id
  }, "notification");

  return res
    .status(200)
    .json(new ApiResponse(201, {}, "One on one chat request processed successfully"));
});

const createAGroupChat = asyncHandler(async (req, res) => {
  const { name, participants } = req.body;

  const members = [...new Set([...participants, req.user._id.toString()])]; // check for duplicates

  if (members.length < 3) {
    throw new ApiError(
      400,
      "Seems like you have passed duplicate participants. Minimum of 3 members are needed"
    );
  }

  // Create a group chat with provided members
  const groupChat = await Chat.create({
    name,
    isGroupChat: true,
    participants: members,
    admin: req.user._id,
    revision: 1,
    lastSequenceId: 1
  });

  const adminFullName = await User.findById(req.user._id).select("fullName");


  const notifyingMessage = {
    _id: new mongoose.Types.ObjectId(),
    messageType: MessageTypes.GROUP_CREATED,
    chat: groupChat._id,
    content: `${adminFullName.fullName} created the group ${name}`,
    sequenceId: 1,
    createdAt: Date.now()
  }


  const messageToSend = {
    chat: groupChat,
    chatId: groupChat._id,
    chatRevision: groupChat.revision,
    notifyingMessage,
    fullChat: true
  }


  const getChatVersionResult = await redisCache.getOrSetAndGetChatVersion(groupChat._id, groupChat.participants);
  if (getChatVersionResult.failed) {
    throw new ApiError(500, "Server error occured, could not load chat");
  }

  const chatVersion = getChatVersionResult.result;

  await redisCache.addNotificationInMemoryForUser({
    messageToSend,
    notificationType: ChatEventEnum.NEW_CHAT_EVENT,
    chatId: groupChat._id,
    excludeIds: [req.user._id]
  },
    groupChat.participants, chatVersion);

  pubSubPublisher.publishMessage(ChatEventEnum.NEW_CHAT_EVENT, messageToSend, groupChat.participants, req.user._id);

  redisStreamsAdder.queueToSend({
    _id: notifyingMessage._id
  }, "notification");


  return res
    .status(201)
    .json(new ApiResponse(201, messageToSend, "Group chat created successfully"));
});


const renameGroupChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { name } = req.body;

  // check for chat existence
  const fetchedChats = await Chat.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(chatId),
        isGroupChat: true,
        participants: new mongoose.Types.ObjectId(req.user._id)
      }
    }, {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "admin",
        as: "admin",
        pipeline: [
          {
            $project: {
              password: 0,
              refreshToken: 0,
              forgotPasswordToken: 0,
              forgotPasswordExpiry: 0,
              emailVerificationToken: 0,
              emailVerificationExpiry: 0,
            },
          },
        ],
      }
    }, {
      $addFields: {
        admin: { $first: "$admin" }
      }
    },
    ...timestampMsConversion()

  ]);

  const groupChat = fetchedChats[0];

  if (!groupChat) {
    throw new ApiError(404, "Group chat does not exist");
  }

  if (groupChat.admin._id.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "User not authorized to perform this action");
  }

  const oldName = groupChat.name;

  const updatedGroupChat = await Chat.findByIdAndUpdate(
    chatId,
    {
      $set: { name },
      $inc: { revision: 1 }
    },
    { new: true }
  );


  const sequenceId = await getSequenceId(groupChat._id, groupChat.lastSequenceId);

  const notifyingMessage = {
    _id: new mongoose.Types.ObjectId(),
    messageType: MessageTypes.GROUP_RENAMED,
    content: `${groupChat.admin?.fullName} renamed group from "${oldName}" to "${updatedGroupChat.name}"`,
    chat: updatedGroupChat._id,
    sequenceId: (sequenceId.result || 1),
    createdAt: Date.now()

  }



  const messageToSend = {
    newName: updatedGroupChat.name,
    chatRevision: updatedGroupChat.revision,
    chatId: updatedGroupChat._id,
    notifyingMessage
  }

  const getChatVersionResult = await redisCache.getOrSetAndGetChatVersion(groupChat._id, groupChat.participants);

  if (getChatVersionResult.failed) {
    throw new ApiError(500, "Server error occured, could not load chat");
  }

  const chatVersion = getChatVersionResult.result;

  await redisCache.addNotificationInMemoryForUser({
    messageToSend,
    notificationType: ChatEventEnum.UPDATE_GROUP_NAME_EVENT,
    excludeIds: [req.user._id]
  }, groupChat.participants, chatVersion);

  pubSubPublisher.publishMessage(ChatEventEnum.UPDATE_GROUP_NAME_EVENT, messageToSend, updatedGroupChat.participants, req.user._id);

  redisStreamsAdder.queueToSend({
    _id: notifyingMessage._id
  }, "notification");


  return res
    .status(200)
    .json(
      new ApiResponse(200, { chatId: updatedGroupChat._id, updatedName: updatedGroupChat.name, chatRevision: updatedGroupChat.revision, notifyingMessage }, "Group chat name updated successfully")
    );
});

const deleteGroupChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const deletedGroupChat = await Chat.findOneAndUpdate({
    _id: chatId, isGroupChat: true, admin: req.user._id
  }, {
    $set: { isDeleted: true, displayPhoto: { url: "" } },
    $inc: { revision: 1 }
  }, {
    new: true
  });

  if (!deletedGroupChat) {
    throw new ApiError(404, "Group chat does not exist or user not authorized");
  }

  const notifyingMessage = {
    _id: `${chatId}_deleted`,
    noNotifyingMessage: true
  }

  const messageToSend = {
    deletedChatId: chatId,
    chatRevision: deletedGroupChat.revision,
    chatId: deletedGroupChat._id,
    notifyingMessage
  }

  const getChatVersionResult = await redisCache.getOrSetAndGetChatVersion(deletedGroupChat._id, deletedGroupChat.participants);

  if (getChatVersionResult.failed) {
    throw new ApiError(500, "Server error occured, could not load chat");
  }

  const chatVersion = getChatVersionResult.result;

  await redisCache.addNotificationInMemoryForUser({
    messageToSend,
    notificationType: ChatEventEnum.DELETE_CHAT_EVENT,
    chatId,
    excludeIds: [req.user._id],
  }, deletedGroupChat.participants, chatVersion);

  pubSubPublisher.publishMessage(ChatEventEnum.DELETE_CHAT_EVENT, messageToSend, deletedGroupChat.participants, req.user._id);

  redisStreamsAdder.queueToSend({
    _id: notifyingMessage._id
  }, "notification");


  return res
    .status(200)
    .json(new ApiResponse(200, { chatRevision: deletedGroupChat.revision }, "Group chat deleted successfully"));
});



const leaveGroupChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;

  const groupChat = await Chat.findOne({
    _id: new mongoose.Types.ObjectId(chatId),
    participants: req.user._id,
    isGroupChat: true,
  }).select("_id");

  if (!groupChat) {
    throw new ApiError(404, "Group chat does not exist or you are not a part of the group");
  }

  const updatedChat = await Chat.findByIdAndUpdate(
    chatId,
    {
      $pull: {
        participants: req.user?._id, // leave the group
      },
      $inc: { revision: 1 }
    },
    { new: true }
  );

  if (!updatedChat) {
    throw new ApiError(500, "Error while removing the user from the group");
  }

  const leftUser = await User.findById(req.user._id).select("fullName");

  const sequenceId = await getSequenceId(updatedChat._id, updatedChat.lastSequenceId);

  // this will show as a message when the person left the group
  const notifyingMessage = {
    _id: new mongoose.Types.ObjectId(),
    messageType: MessageTypes.PARTICIPANT_LEFT,
    chat: chatId,
    content: `${leftUser.fullName} left the group`,
    sequenceId: Number(sequenceId.result || 1),
    createdAt: Date.now()
  }

  const messageToSend = {
    chatRevision: updatedChat.revision,
    chatId: updatedChat._id,
    notifyingMessage,
    removedParticipantIds: [req.user._id]
  }

  const setAndGetChatVersionResult = await redisCache.incAndGetChatVersion(updatedChat._id, updatedChat.participants);

  if (setAndGetChatVersionResult.failed) {
    throw new ApiError(500, "Server error occured, could not load chat");
  }

  const chatVersion = setAndGetChatVersionResult.result;

  await redisCache.addNotificationInMemoryForUser({
    messageToSend,
    notificationType: ChatEventEnum.MEMBER_LEFT_EVENT,
    chatId: updatedChat._id,
    excludeIds: [req.user._id],
  }, updatedChat.participants, chatVersion);

  pubSubPublisher.publishMessage(ChatEventEnum.MEMBER_LEFT_EVENT, messageToSend, updatedChat.participants, req.user._id);

  redisStreamsAdder.queueToSend({
    _id: notifyingMessage._id
  }, "notification");


  return res
    .status(200)
    .json(new ApiResponse(200, { chatRevision: updatedChat.revision }, "Left the group successfully"));
});

const addNewParticipantInGroupChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { participantIds } = req.body;

  const groupChat = await Chat.findOne({ _id: chatId, isGroupChat: true });

  if (!groupChat) {
    throw new ApiError(404, "Group chat does not exist");
  }

  if (groupChat.admin?.toString() !== req.user._id?.toString()) {
    throw new ApiError(403, "You are not an admin");
  }

  const existingParticipants = groupChat.participants;

  for (const m of existingParticipants) {
    let index;
    while ((index = participantIds.findIndex(p => p.toString() === m.toString())) !== -1) {
      participantIds.splice(index, 1)
    }
  }


  const updatedResult = await Chat.findByIdAndUpdate(
    chatId,
    {
      $push: {
        "participants": { $each: participantIds },
      },
      $inc: { revision: 1 }
    },
    { new: true }
  );

  const chat = await Chat.aggregate([
    {
      $match: {
        _id: updatedResult._id,
      },
    },
    ...chatCommonAggregation(),
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "admin",
        as: "admin",
        pipeline: [
          {
            $project: {
              password: 0,
              refreshToken: 0,
              forgotPasswordToken: 0,
              forgotPasswordExpiry: 0,
              emailVerificationToken: 0,
              emailVerificationExpiry: 0,
            },
          },
        ],
      }
    }, {
      $addFields: {
        admin: { $first: "$admin" }
      }
    },
    ...timestampMsConversion()
  ]);

  const payload = chat[0];

  const addedMembersDocuments = await User.find({ _id: { $in: participantIds } })
    .select("fullName");

  const addedMembersNamesArray = addedMembersDocuments.map(doc => doc.fullName);

  const sequenceId = await getSequenceId(updatedResult._id, updatedResult.lastSequenceId);

  const notifyingMessage = {
    _id: new mongoose.Types.ObjectId(),
    messageType: MessageTypes.PARTICIPANT_ADDED,
    chat: chatId,
    content: `${payload.admin?.fullName} added ${addedMembersNamesArray.join(", ")} to the group`,
    sequenceId: Number(sequenceId.result || 1),
    createdAt: Date.now()
  };

  const messageToSend = {
    notifyingMessage,
    addedParticipantIds: participantIds,
    chatId: updatedResult._id,
    chatRevision: updatedResult.revision
  }

  const setAndGetChatVersionResult = await redisCache.incAndGetChatVersion(updatedResult._id, updatedResult.participants);

  if (setAndGetChatVersionResult.failed) {
    throw new ApiError(500, "Server error occured, could not load chat");
  }

  await redisCache.addNotificationInMemoryForUser({
    messageToSend,
    notificationType: ChatEventEnum.NEW_MEMBER_EVENT,
    excludeIds: [req.user._id],
  }, existingParticipants);

  pubSubPublisher.publishMessage(ChatEventEnum.NEW_MEMBER_EVENT, messageToSend, existingParticipants, req.user._id);

  redisStreamsAdder.queueToSend({
    _id: notifyingMessage._id
  }, "notification");

  const notifyingMesageForNewMembers = {
    _id: (new mongoose.Types.ObjectId()).toString(),
    noNotifyingMessage: true
  }
  const messageToSendForNewMembers = {
    chat: updatedResult,
    chatId: groupChat._id,
    chatRevision: updatedResult.revision,
    notifyingMessage: notifyingMesageForNewMembers,
    fullChat: true
  }


  await redisCache.addNotificationInMemoryForUser({
    messageToSend: messageToSendForNewMembers,
    notificationType: ChatEventEnum.NEW_IN_CHAT_EVENT,
    excludeIds: []
  }, participantIds);

  pubSubPublisher.publishMessage(ChatEventEnum.NEW_IN_CHAT_EVENT, messageToSendForNewMembers, participantIds, req.user._id);

  redisStreamsAdder.queueToSend({
    _id: notifyingMesageForNewMembers._id
  }, "notification");

  return res
    .status(200)
    .json(new ApiResponse(200, { updatedChat: payload, notifyingMessage, chatRevision: updatedResult.revision }, "Participant(s) added successfully"));
});

const removeParticipantFromGroupChat = asyncHandler(async (req, res) => {

  const { chatId } = req.params;
  const { participantIds } = req.body;

  const groupChat = await Chat.findOne({ _id: chatId, isGroupChat: true });

  if (!groupChat) {
    throw new ApiError(404, "Group chat does not exist");
  }

  if (groupChat.admin?.toString() !== req.user._id?.toString()) {
    throw new ApiError(403, "You are not an admin");
  }

  const existingParticipants = groupChat.participants;

  const participantsToRemove = []

  participantIds.forEach(p => {
    if (existingParticipants.findIndex(ep => ep.toString() === p) !== -1) {
      participantsToRemove.push(p)
    }
  })

  if (!participantsToRemove.length) {
    throw new ApiError(400, "These participants do not exist in the group")
  }

  const updatedResult = await Chat.findByIdAndUpdate(
    chatId,
    {
      $pull: {
        "participants": { $in: participantsToRemove } // remove participant id
      },
      $inc: { revision: 1 }
    },
    { new: true }
  );

  const chat = await Chat.aggregate([
    {
      $match: {
        _id: updatedResult._id,
      },
    },
    ...chatCommonAggregation(),
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "admin",
        as: "admin",
        pipeline: [
          {
            $project: {
              password: 0,
              refreshToken: 0,
              forgotPasswordToken: 0,
              forgotPasswordExpiry: 0,
              emailVerificationToken: 0,
              emailVerificationExpiry: 0,
            },
          },
        ],
      }
    }, {
      $addFields: {
        admin: { $first: "$admin" }
      }
    },
    ...timestampMsConversion()
  ]);

  const payload = chat[0];

  if (!payload) {
    throw new ApiError(500, "Internal server error");
  }

  const removedMembersDocuments = await User.find({ _id: { $in: participantsToRemove } })
    .select("fullName");

  const removedMembersNamesArray = removedMembersDocuments.map(doc => doc.fullName);

  const sequenceId = await getSequenceId(updatedResult._id, updatedResult.lastSequenceId);

  const notifyingMessage = {
    _id: new mongoose.Types.ObjectId(),
    messageType: MessageTypes.PARTICIPANT_REMOVED,
    chat: chatId,
    content: `${payload.admin?.fullName} removed ${removedMembersNamesArray.join(", ")} from the group`,
    sequenceId: Number(sequenceId.result || 1),
    createdAt: Date.now()
  };

  const messageToSend = {
    notifyingMessage,
    removedParticipantIds: participantsToRemove,
    chatId: updatedResult._id,
    chatRevision: updatedResult.revision
  }

  const setAndGetChatVersionResult = await redisCache.incAndGetChatVersion(updatedResult._id, updatedResult.participants);

  if (setAndGetChatVersionResult.failed) {
    throw new ApiError(500, "Server error occured, could not load chat");
  }

  const chatVersion = setAndGetChatVersionResult.result;

  await redisCache.addNotificationInMemoryForUser({
    messageToSend,
    notificationType: ChatEventEnum.REMOVE_MEMBER_EVENT,
    excludeIds: [req.user._id],
    chatId: updatedResult._id
  }, updatedResult.participants, chatVersion);

  pubSubPublisher.publishMessage(ChatEventEnum.REMOVE_MEMBER_EVENT, messageToSend, updatedResult.participants, req.user._id);

  redisStreamsAdder.queueToSend({
    _id: notifyingMessage._id
  }, "notification");

  const notifyingMessageForRemovedMembers = {
    _id: (new mongoose.Types.ObjectId()).toString(),
    noNotifyingMessage: true
  }

  const messageToSendForRemovedMembers = {
    notifyingMessage: notifyingMessageForRemovedMembers,
    chatRevision: updatedResult.revision,
    chatId: updatedResult._id
  }

  await redisCache.addNotificationInMemoryForUser({
    messageToSend: messageToSendForRemovedMembers,
    notificationType: ChatEventEnum.EXIT_MEMBER_EVENT,
    excludeIds: [],
  }, participantsToRemove);

  pubSubPublisher.publishMessage(ChatEventEnum.EXIT_MEMBER_EVENT, messageToSendForRemovedMembers, participantsToRemove, req.user._id);


  redisStreamsAdder.queueToSend({
    _id: notifyingMessageForRemovedMembers._id
  }, "notification");

  return res
    .status(200)
    .json(new ApiResponse(200, { updatedChat: payload, notifyingMessage, chatRevision: payload.revision }, "Participant(s) removed successfully"));
});

const getAllChats = asyncHandler(async (req, res) => {

  await clearNotificationsForUser(req.user?._id);

  const chats = await Chat.aggregate([
    {
      $match: {
        participants: { $elemMatch: { $eq: new mongoose.Types.ObjectId(req.user._id) } },
      },
    },
    {
      $sort: {
        updatedAt: -1,
      },
    }, {
      $addFields: {


        participants: {
          $cond: [{ $eq: ["$isGroupChat", true] }, [
            { $arrayElemAt: ["$participants", 0] }, { $arrayElemAt: ["$participants", 1] }, { $arrayElemAt: ["$participants", 2] }
          ],
            "$participants"]


        }

      },
    }, ...timestampMsConversion()
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, chats || [], "User chats fetched successfully!")
    );
});

const getChatInfoWithoutProfiles = asyncHandler(async (req, res) => {
  const chat = await Chat.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.params.chatId),
        participants: { $elemMatch: { $eq: new mongoose.Types.ObjectId(req.user._id) } },
      },
    }, {
      $addFields: {
        participants: {
          $cond: [{ $eq: ["$isGroupChat", true] }, [
            { $arrayElemAt: ["$participants", 0] }, { $arrayElemAt: ["$participants", 1] }, { $arrayElemAt: ["$participants", 2] }
          ],
            "$participants"]
        }
      },
    }
  ]);


  return res
    .status(200)
    .json(
      new ApiResponse(200, chat[0] || {}, "getChatInfoWithoutProfiles was successful!")
    );
});

const getBriefChatInfo = asyncHandler(async (req, res) => {
  const chat = await Chat.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.params.chatId),
        participants: { $elemMatch: { $eq: new mongoose.Types.ObjectId(req.user._id) } },
      },
    },
    ...chatCommonAggregation(),
    {
      $addFields: {
        participants: {
          $cond: [{ $eq: ["$isGroupChat", true] }, [
            { $arrayElemAt: ["$participants", 0] }, { $arrayElemAt: ["$participants", 1] }, { $arrayElemAt: ["$participants", 2] }
          ],
            "$participants"]
        }
      },
    },
    ...timestampMsConversion()
  ]);



  return res
    .status(200)
    .json(
      new ApiResponse(200, chat[0] || {}, "Chat info fetched successfully!")
    );
});

const getChatInfo = asyncHandler(async (req, res) => {
  const chat = await Chat.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.params.chatId),
        participants: { $elemMatch: { $eq: new mongoose.Types.ObjectId(req.user._id) } },
      },
    },
    ...chatCommonAggregation(),
    {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "admin",
        as: "admin",
        pipeline: [
          {
            $project: {
              password: 0,
              refreshToken: 0,
              forgotPasswordToken: 0,
              forgotPasswordExpiry: 0,
              emailVerificationToken: 0,
              emailVerificationExpiry: 0,
            },
          },
        ],
      }

    },
    {
      $addFields: {
        admin: { $first: "$admin" },
      }
    },
    ...timestampMsConversion()
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, chat[0] || [], "Chat info fetched successfully!")
    );
});

const updateChatDisplayPhoto = asyncHandler(async (req, res) => {
  const chatId = req.params.chatId;

  if (!req.files?.dpLg?.[0] || !req.files?.dpSm?.[0]) {
    throw new ApiError(404, "File not found");
  }

  const fetchedChat = await Chat.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(chatId),
        participants: new mongoose.Types.ObjectId(req.user._id),
        isGroupChat: true,
      }
    }, {
      $lookup: {
        from: "users",
        foreignField: "_id",
        localField: "admin",
        as: "admin",
        pipeline: [
          {
            $project: {
              password: 0,
              refreshToken: 0,
              forgotPasswordToken: 0,
              forgotPasswordExpiry: 0,
              emailVerificationToken: 0,
              emailVerificationExpiry: 0,
            },
          },
        ],
      }

    },
    {
      $addFields: {
        admin: { $first: "$admin" },
      }
    },
    ...timestampMsConversion()

  ]);

  const chatExists = fetchedChat[0];

  if (!chatExists) {
    throw new ApiError(404, "Chat not found");
  }

  if (chatExists.admin._id.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "User not authorized to perform this action");
  }

  if (!gfsBucketDP) {
    throw new ApiError(500, "Bucket not initialized, please try again");
  }

  const images = [req.files.dpLg[0], req.files.dpSm[0]];
  const uploadedName = `${Date.now()}-dp-${images[0].originalname}`
  // Create an array of upload promises
  const uploadPromises = images.map((file, i) => {
    return new Promise((resolve, reject) => {
      // Validation
      if (file.mimetype !== "image/webp") {
        return reject(new Error(`Invalid type for ${file.originalname}`));
      }

      const size = i === 0 ? AvatarSize.LG : AvatarSize.SM;
      const fullUploadedName = `${uploadedName}_${size}`;

      const uploadStream = gfsBucketDP.openUploadStream(fullUploadedName, {
        contentType: file.mimetype
      });

      uploadStream.end(file.buffer);

      uploadStream.on('finish', () => {
        resolve({ fileId: uploadStream.id, filename: fullUploadedName });
      });

      uploadStream.on('error', (err) => reject(new ApiError(500, "Upload Failed")));
    });
  });

  // Wait for all memory buffers to finish writing to MongoDB
  await Promise.all(uploadPromises);

  const payload = await Chat.findOneAndUpdate({ _id: chatId }, {
    $set: { displayPhoto: { url: uploadedName } },
    $inc: { revision: 1 }
  }, { new: true });

  if (!payload) {
    throw new ApiError(500, "Error creating message")
  }

  if (chatExists.displayPhoto?.url) {
    const dpDocsCursor = conn.db.collection('dp.files').find({
      filename: {
        $in: [`${chatExists.displayPhoto.url}_${AvatarSize.LG}`, `${chatExists.displayPhoto.url}_${AvatarSize.SM}`]
      }
    });

    if (dpDocsCursor) {
      for await (const doc of cursor) {
        await gfsBucketDP.delete(doc._id);

      }
    }
  }

  const sequenceId = await getSequenceId(payload._id, payload.lastSequenceId);


  const notifyingMessage = {
    _id: new mongoose.Types.ObjectId(),
    messageType: MessageTypes.CHANGED_DP,
    chat: chatId,
    content: `${chatExists.admin?.fullName} updated the display photo for the group`,
    sequenceId: Number(sequenceId.result || 1),
    createdAt: Date.now()

  };

  const getChatVersionResult = await redisCache.getOrSetAndGetChatVersion(payload._id, payload.participants);

  if (getChatVersionResult.failed) {
    throw new ApiError(500, "Server error occured, could not load chat");
  }

  const chatVersion = getChatVersionResult.result;

  const messageToSend = {
    notifyingMessage,
    newPhoto: payload.displayPhoto,
    chatRevision: payload.revision,
    chatId: payload._id,

  }

  await redisCache.addNotificationInMemoryForUser({
    messageToSend,
    notificationType: ChatEventEnum.UPDATE_GROUP_PHOTO_EVENT,
    chatId: payload._id,
    excludeIds: [req.user._id],
  }, payload.participants, chatVersion);

  pubSubPublisher.publishMessage(ChatEventEnum.UPDATE_GROUP_PHOTO_EVENT, messageToSend, payload.participants, req.user._id);

  redisStreamsAdder.queueToSend({
    _id: notifyingMessage._id
  }, "notification");


  return res
    .status(200)
    .json(new ApiResponse(200, { newPhoto: payload.displayPhoto, notifyingMessage, chatRevision: payload.revision, chatId }, "Display photo updated successfully"));

});


const getDP = asyncHandler(async (req, res, next) => {
  const dpName = req.params.dpName;

  if (!dpName) {
    throw new ApiError(404, "DP info not provided");
  }

  const downloadStream = gfsBucketDP.openDownloadStreamByName(dpName);
  downloadStream.on("file", (file) => {
    try {
      res.set('Content-Type', file.contentType);
    } catch (error) {
      next(error)
    }
  });
  downloadStream.on('error', (error) => {
    try {
      console.log("Error downloading file: ", error)
      throw new ApiError(500, "Error downloading file")
    } catch (error) {
      next(error)
    }

  });
  downloadStream.pipe(res);


});

const getParticipantProfile = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  const user = await User.findById(userId).select("avatar fullName");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const profile = {
    ...user.toObject(),
    lastUpdated: Date.now()
  }


  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        profile,
        "Profile fetched successfully"
      )
    );
});


const getParticipantAvatar = asyncHandler(async (req, res) => {
  const userId = req.params.userId;

  const user = await User.findById(userId).select("avatar");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const avatar = {
    ...user.toObject(),
    lastUpdated: Date.now()
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        avatar,
        "Avatar fetched successfully"
      )
    );
});


const checkChatAvailabilityForUser = asyncHandler(async (req, res) => {
  const chat = await Chat.findOne({ _id: req.params.chatId, participants: req.user._id }).select("_id");
  const chatAvailable = chat ? true : false

  return res
    .status(200)
    .json(new ApiResponse(200, { chatAvailable }, "Request completed successfully"));
})


export {
  addNewParticipantInGroupChat,
  createAGroupChat,
  createOrGetAOneOnOneChat,
  deleteGroupChat,
  getAllChats,
  leaveGroupChat,
  removeParticipantFromGroupChat,
  renameGroupChat,
  searchAvailableUsers,
  getChatInfoWithoutProfiles,
  getBriefChatInfo,
  getChatInfo,
  updateChatDisplayPhoto,
  getDP,
  getParticipantProfile,
  getParticipantAvatar,
  checkChatAvailabilityForUser
};

