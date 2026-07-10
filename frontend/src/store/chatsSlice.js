import { createSlice } from "@reduxjs/toolkit";
import { MessageTypes } from "../constants.js";

const initialState = []

const chatsSlice = createSlice({
  name: "chats",
  initialState,

  reducers: {
    setChats: (_, action) => {
      return action.payload;
    },


    updateGroupChatPhoto: (state, action) => {
      const { updatedDisplayPhoto, chatRevision, chatId } = action.payload;
      const reqIndex = state.findIndex(chat => chat._id.toString() === chatId.toString());
      if (reqIndex !== -1) {
        state[reqIndex].displayPhoto = updatedDisplayPhoto;
        state[reqIndex].revision = chatRevision;
      }
    },


    addLastMessage: (state, action) => {
      const { message, setNotOpened } = action.payload;
      let sender = message.sender?._id ? message.sender : message.sender ? ({ _id: message.sender }) : null
      const reqIndex = state.findIndex(chat => chat._id.toString() === message.chat.toString());
      //ensure it is not a duplicate message
      if ((reqIndex !== -1) && (state[reqIndex].lastMessage?._id !== message._id.toString())) {

        const reqChat = state[reqIndex];

        if (setNotOpened) {
          reqChat.unreadCount = (reqChat.unreadCount || 0) + 1;
        }

        if (!reqChat.lastSequenceId || (reqChat.lastSequenceId < message.sequenceId)) {
          reqChat.lastSequenceId = message.sequenceId;
        }

        if (!reqChat.lastMessage || (reqChat.lastMessage.deviceTime < message.deviceTime)) {

          if (!sender?.fullName && sender?._id && (reqChat.lastMessage?.sender?._id === sender._id)) {
            sender = reqChat.lastMessage.sender;
          }

          reqChat.lastMessage = { ...message, sender };
          reqChat.updatedAt = message.deviceTime;

          state[reqIndex] = reqChat;

          if (reqIndex !== 0) {
            const latestChat = (state.splice(reqIndex, 1))[0];
            state.unshift(latestChat);
          }
        } else {
          state[reqIndex] = reqChat;
        }

      } else {
        // if there is no chat found, it must be a new one
        if (message.chat) {
          const newChat = {
            _id: message.chat,
            updatedAt: message?.deviceTime,
            lastSequenceId: message?.sequenceId,
            unreadCount: 1,
            lastMessage: { ...message, sender }
          }

          return [newChat, ...state]
        }

      }

    },


    addLastMessageWithoutUnreadIncrement: (state, action) => {
      const reqIndex = state.findIndex(chat => chat._id.toString() === action.payload.chat.toString());
      //ensure it is not a duplicate message
      if ((reqIndex !== -1) && (state[reqIndex].lastMessage?._id !== action.payload._id.toString())) {

        const reqChat = state[reqIndex];

        const sender = action.payload.sender ? ({ _id: (action.payload.sender?._id || action.payload.sender) }) : null;

        // check if sequence id is present and then change if needed
        if (action.payload.sequenceId && (!reqChat.lastSequenceId || (reqChat.lastSequenceId < action.payload.sequenceId))) {
          reqChat.lastSequenceId = action.payload.sequenceId;
        }

        if (!reqChat.lastMessage || reqChat.lastMessage.deviceTime < action.payload.deviceTime) {
          reqChat.lastMessage = { ...action.payload, sender };
          reqChat.updatedAt = action.payload.deviceTime;

          state[reqIndex] = reqChat;
          if (reqIndex !== 0) {
            const latestChat = (state.splice(reqIndex, 1))[0];
            state.unshift(latestChat);
          }
        } else {
          state[reqIndex] = reqChat;
        }

      }

    },


    updateLastMessage: (state, action) => {
      const reqIndex = state.findIndex(chat => chat._id.toString() === action.payload.chat.toString());
      if (reqIndex !== -1 && state[reqIndex].lastMessage?._id === action.payload._id) {
        const sender = action.payload.sender ? (state[reqIndex].sender) : null;
        state[reqIndex].lastMessage = { ...action.payload, sender };
      }
    },


    exitMemberFromGroupChat: (state, action) => {
      const { chatId, chatRevision } = action.payload;
      const reqIndex = state.findIndex(chat => chat._id === chatId);

      if (reqIndex !== -1) {
        state[reqIndex].notAMember = true;
        if (chatRevision) {
          state[reqIndex].revision = chatRevision;
        }
      }
    },


    updateFieldsInChat: (state, action) => {
      const { updatedFields, chatId } = action.payload;
      const reqIndex = state.findIndex(chat => chat._id === chatId);

      if (reqIndex !== -1) {
        state[reqIndex] = { ...state[reqIndex], ...updatedFields }
      } else {
        state.unshift({ _id: chatId, ...updatedFields });
      }
    },


    removePossiblyInaccurateRevisionFromChat: (state, action) => {
      const reqIndex = state.findIndex(chat => chat._id === action.payload);
      if (reqIndex !== -1) {
        state[reqIndex].possiblyInaccurateRevision = false;
      }
    },


    updateChatOnMessageDelete: (state, action) => {
      const { lastMessageForChat, chat } = action.payload;
      const reqIndex = state.findIndex(c => c._id.toString() === chat.toString());
      if (!lastMessageForChat) {
        state[reqIndex].lastMessage = null
      } else {
        state[reqIndex].lastMessage = { ...lastMessageForChat, sender: { _id: lastMessageForChat.sender } };
      }
      state.sort((a, b) => {
        return new Date(b.lastMessage?.createdAt) - new Date(a.lastMessage?.createdAt)
      });

    },


    declareAChatDeleted: (state, action) => {
      const { chatId, chatRevision } = action.payload;
      const reqIndex = state.findIndex(c => c._id.toString() === chatId.toString());
      if (reqIndex !== -1) {
        state[reqIndex].isDeleted = true;
        if (chatRevision) {
          state[reqIndex].revision = chatRevision;
        }
      }
    },


    updateOtherParticipantProfileForChats: (state, action) => {
      const { otherParticipantProfile, chatId } = action.payload;
      const reqIndex = state.findIndex(c => c._id.toString() === chatId);
      if (reqIndex !== -1) {
        const userParticipant = state[reqIndex].participants.find(p => p._id !== otherParticipantProfile._id);
        const newParticipantsArray = [userParticipant, otherParticipantProfile];
        state[reqIndex].participants = newParticipantsArray;
      }
    },


    updateOtherParticipantAvatarForChats: (state, action) => {
      const { avatarUpdates, chatId } = action.payload;
      const { lastUpdated, avatar, _id: otherParticipantId } = avatarUpdates;
      const reqIndex = state.findIndex(c => c._id.toString() === chatId);
      if (reqIndex !== -1) {
        const otherParticipantIndex = state[reqIndex].participants.findIndex(p => p._id === otherParticipantId);
        if (otherParticipantIndex !== -1) {
          state[reqIndex].participants[otherParticipantIndex].avatar = avatar;
          state[reqIndex].participants[otherParticipantIndex].lastUpdated = lastUpdated;
        }
      }
    },


    updateLastMessageSentStatus: (state, action) => {
      const { messageId, chatId, intendedParticipantCount, sequenceIdAssigned } = action.payload;
      const reqIndex = state.findIndex(chat => chat._id === chatId);

      if ((reqIndex !== -1) && (state[reqIndex].lastMessage?._id === messageId)) {
        state[reqIndex].lastMessage.notSent = false;
        state[reqIndex].lastMessage.failedToSend = false;

        if (intendedParticipantCount) {
          state[reqIndex].lastMessage.intendedParticipantCount = intendedParticipantCount;
        }

        if (sequenceIdAssigned && (sequenceIdAssigned > (state[reqIndex].lastSequenceId || 0))) {
          state[reqIndex].lastSequenceId = sequenceIdAssigned;
        }
      }
    },


    updateLastMessageDeliveredAndSeenStatus: (state, action) => {
      const { messageId, chatId, updatedDeliveredStatusCount, updatedSeenStatusCount } = action.payload;

      if (updatedDeliveredStatusCount || updatedSeenStatusCount) {
        const reqIndex = state.findIndex(chat => chat._id === chatId);
        if (reqIndex !== -1 && (state[reqIndex].lastMessage?._id === messageId)) {
          state[reqIndex].lastMessage.delivered = { length: updatedDeliveredStatusCount };
          state[reqIndex].lastMessage.seen = { length: updatedSeenStatusCount };
          state[reqIndex].lastMessage.notSent = false;
          state[reqIndex].lastMessage.failedToSend = false;
        }
      }
    },


    updateLastMessageSenderProfile: (state, action) => {
      const { profile, chatId } = action.payload;
      const reqIndex = state.findIndex(c => c._id.toString() === chatId);
      if (reqIndex !== -1) {
        if (state[reqIndex].lastMessage?.sender?._id === profile._id) {
          state[reqIndex].lastMessage.sender = profile;
        }
      }
    },


    updateUnreadCountToZeroForChat: (state, action) => {
      const reqIndex = state.findIndex(c => c._id.toString() === action.payload);
      if (reqIndex !== -1) {
        state[reqIndex].unreadCount = 0;
      }
    },


    updateLastMessageToDeletedInCurrentChat: (state, action) => {
      const { messageId, chatId } = action.payload;
      const reqChatIndex = state.findIndex(c => c._id.toString() === chatId);
      if (reqChatIndex !== -1) {
        if (state[reqChatIndex].lastMessage?._id && state[reqChatIndex].lastMessage._id === messageId) {

          state[reqChatIndex].lastMessage = { ...state[reqChatIndex].lastMessage, content: "", messageType: MessageTypes.DELETED }
          if (state[reqChatIndex].lastMessage.blobUrl) {
            state[reqChatIndex].lastMessage.blobUrl = "";
          }
        }
      }
    },


    makeChatVerified: (state, action) => {
      const { verifiedChatId, oldId, chatRevision } = action.payload;
      if (verifiedChatId === oldId) {
        const reqIndex = state.findIndex(c => c._id === verifiedChatId);
        if (reqIndex !== -1) {
          state[reqIndex].notVerified = false;
          if (!state[reqIndex].revision) {
            state[reqIndex].revision = chatRevision;
          }
        }

      } else {
        const reqIndexWithNewId = state.findIndex(c => c._id === verifiedChatId);
        let oldIdChatNeedsDeleted = false;
        if (reqIndexWithNewId !== -1) {
          oldIdChatNeedsDeleted = true;
        }

        const reqIndexWithOldId = state.findIndex(c => c._id === oldId);

        if (reqIndexWithOldId !== -1) {
          if (oldIdChatNeedsDeleted) {
            state.splice(reqIndexWithOldId, 1);
          } else {
            state[reqIndexWithOldId]._id = verifiedChatId;
            state[reqIndexWithOldId].revision = chatRevision;
            state[reqIndexWithOldId].notVerified = false;
          }
        }
      }
    },


    updateChatRevision: (state, action) => {
      const { chatId, chatRevision } = action.payload;
      const reqIndex = state.findIndex(c => c._id === chatId);
      if (reqIndex !== -1) {
        state[reqIndex].revision = chatRevision;
      }
    },


    updateChatName: (state, action) => {
      const { chatId, chatRevision, updatedName } = action.payload;
      const reqIndex = state.findIndex(c => c._id === chatId);
      if (reqIndex !== -1) {
        state[reqIndex].name = updatedName;
        state[reqIndex].revision = chatRevision;
      }
    },


    removeParticipantsInChat: (state, action) => {
      const { removedParticipantIds, chatId, chatRevision } = action.payload;
      const reqIndex = state.findIndex(c => c._id === chatId);
      if (reqIndex !== -1) {
        const updatedMembers = state[reqIndex].participants?.filter(p => !removedParticipantIds.includes(p._id));
        state[reqIndex].participants = updatedMembers;
        state[reqIndex].revision = chatRevision;
      }
    },


    updateChat: (state, action) => {
      const participantsArray = action.payload.participants ?
        (
          action.payload.participants?.[0]?._id ? action.payload.participants : action.payload.participants.map(p => ({ _id: p }))
        ) : null;

      const reqIndex = state.findIndex(c => c._id.toString() === action.payload._id.toString());

      if (reqIndex !== -1) {
        if (!state[reqIndex].revision || (state[reqIndex].revision < action.payload.revision)) {
          state[reqIndex] = {
            ...action.payload,
            participants: participantsArray,
            lastMessage: state[reqIndex].lastMessage,
            updatedAt: state[reqIndex].updatedAt,
            lastSequenceId: state[reqIndex].lastSequenceId
          }
        }
      } else {
        const { lastSequenceId, ...chatWithoutSequenceId } = action.payload;
        state.push({ ...chatWithoutSequenceId, participants: participantsArray });
        state.sort((a, b) => {
          return new Date(b.updatedAt) - new Date(a.updatedAt)
        });
      }
    },


    updateOrTransferChat: (state, action) => {
      const { newChat, oldId } = action.payload;
      const participantsArray = newChat.participants ?
        (
          newChat.participants?.[0]?._id ? newChat.participants : newChat.participants.map(p => ({ _id: p }))
        ) : null;

      const reqIndexWithNewId = state.findIndex(c => c._id.toString() === newChat._id.toString());
      let oldIdChatNeedsDeleted = false;

      if (reqIndexWithNewId !== -1) {
        if (!state[reqIndexWithNewId].revision || (state[reqIndexWithNewId].revision < newChat.revision)) {
          state[reqIndexWithNewId] = {
            ...newChat,
            participants: participantsArray,
            lastMessage: state[reqIndexWithNewId].lastMessage,
            updatedAt: state[reqIndexWithNewId].updatedAt,
            lastSequenceId: state[reqIndexWithNewId].lastSequenceId
          }
        }

        oldIdChatNeedsDeleted = true;
      }

      const reqIndexWithOldId = state.findIndex(c => c._id.toString() === oldId.toString());
      if (reqIndexWithOldId !== -1) {
        if (oldIdChatNeedsDeleted) {
          if (state[reqIndexWithOldId]?.lastMessage?.deviceTime && (!state[reqIndexWithNewId]?.lastMessage?.deviceTime || (state[reqIndexWithOldId].lastMessage.deviceTime > state[reqIndexWithNewId].lastMessage.deviceTime))) {
            state[reqIndexWithNewId].lastMessage = state[reqIndexWithOldId].lastMessage;
          }

          if (state[reqIndexWithOldId]?.lastSequenceId && (!state[reqIndexWithNewId]?.lastSequenceId || (state[reqIndexWithOldId].lastSequenceId > state[reqIndexWithNewId].lastSequenceId))) {
            state[reqIndexWithNewId].lastSequenceId = state[reqIndexWithOldId].lastSequenceId;
          }

          state.splice(reqIndexWithOldId, 1);
        } else {
          const updatedOldChatId = {
            ...newChat,
            participants: participantsArray,
            lastMessage: state[reqIndexWithOldId].lastMessage,
            updatedAt: state[reqIndexWithOldId].updatedAt,
            lastSequenceId: state[reqIndexWithOldId].lastSequenceId
          }
          state[reqIndexWithOldId] = updatedOldChatId;
        }
      } else {
        state.push({ ...newChat, participants: participantsArray, lastSequenceId: 0 });
        state.sort((a, b) => {
          return new Date(b.updatedAt) - new Date(a.updatedAt)
        });
      }
    },

    markLastMessageFailedToSend: (state, action) => {
      const { messageId, chatId } = action.payload;
      const reqIndex = state.findIndex(c => c._id === chatId);
      const reqChatLastMessage = state[reqIndex].lastMessage;
      if (reqIndex !== -1) {
        if ((reqChatLastMessage?._id === messageId) && reqChatLastMessage.notSent) {
          state[reqIndex].lastMessage.notSent = false;
          state[reqIndex].lastMessage.failedToSend = true;
        }
      }
    }
  }

})

export default chatsSlice.reducer;

export const {
  setChats,
  addLastMessage,
  addLastMessageWithoutUnreadIncrement,
  updateLastMessage,
  exitMemberFromGroupChat,
  updateFieldsInChat,
  removePossiblyInaccurateRevisionFromChat,
  updateChatOnMessageDelete,
  updateGroupChatPhoto,
  declareAChatDeleted,
  updateOtherParticipantProfileForChats,
  updateOtherParticipantAvatarForChats,
  updateLastMessageSentStatus,
  updateLastMessageDeliveredAndSeenStatus,
  updateLastMessageSenderProfile,
  updateUnreadCountToZeroForChat,
  updateLastMessageToDeletedInCurrentChat,
  makeChatVerified,
  updateChatRevision,
  updateChatName,
  removeParticipantsInChat,
  updateChat,
  updateOrTransferChat,
  markLastMessageFailedToSend
} = chatsSlice.actions;
