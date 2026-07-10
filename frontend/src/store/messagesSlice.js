import { createSlice } from "@reduxjs/toolkit";
import { MessageTypes } from "../constants.js";

const initialState = [];

const messagesSlice = createSlice({

  name: "messages",
  initialState,

  reducers: {

    setMessages: (_, action) => {
      return action.payload;
    },


    addMessage: (state, action) => {
      //ensure it is not a duplicate message
      if (!state.length || (state[0]?._id !== action.payload._id.toString())) {
        const sender = action.payload.sender ? ({ _id: (action.payload.sender?._id || action.payload.sender) }) : null;
        return [{ ...action.payload, sender }, ...state];
      }
    },


    addMessagesAtEnd: (state, action) => {
      return [...state, ...action.payload];
    },


    addMessagesAtStart: (state, action) => {
      return [...action.payload, ...state];
    },


    addWaitingMessages: (state, action) => {
      const waitingMessagesInCorrectedOrder = action.payload.reverse();
      return [...waitingMessagesInCorrectedOrder, ...state];
    },


    updateMessage: (state, action) => {
      const reqIndex = state.findIndex(message => message._id === action.payload._id);
      const sender = action.payload.sender ? ({ _id: (action.payload.sender?._id || action.payload.sender) }) : null
      if (reqIndex !== -1) {
        state[reqIndex] = { ...action.payload, sender };
      }
    },


    resetMessages: () => {
      return [];

    },


    setMessageSentStatus: (state, action) => {
      const { messageId, intendedParticipantCount, sequenceIdAssigned } = action.payload;
      const reqIndex = state.findIndex(message => message._id === messageId);

      if (reqIndex !== -1) {
        state[reqIndex].notSent = false;
        state[reqIndex].failedToSend = false;
        if (intendedParticipantCount) {
          state[reqIndex].intendedParticipantCount = intendedParticipantCount;
        }

        if (sequenceIdAssigned) {
          state[reqIndex].sequenceId = sequenceIdAssigned;
        }
      }
    },


    setMessageDeliveredAndSeenStatus: (state, action) => {
      const { messageId, updatedDeliveredStatusCount, updatedSeenStatusCount } = action.payload;
      const reqIndex = state.findIndex(message => message._id === messageId);
      if (reqIndex !== -1) {
        state[reqIndex].delivered = { length: updatedDeliveredStatusCount };
        state[reqIndex].seen = { length: updatedSeenStatusCount };
        state[reqIndex].notSent = false;
        state[reqIndex].failedToSend = false;
      }
    },


    purgeMessagesFromBottom: (state, action) => {
      const { chatId, index } = action.payload;
      if (state[0]?.chat === chatId) {
        return state.slice(index + 1);
      }
    },


    purgeMessagesFromTop: (state, action) => {
      const { chatId, index } = action.payload;
      if (state[0]?.chat === chatId) {
        return state.slice(0, index + 1);
      }
    },


    markMessageDeleted: (state, action) => {
      const { messageId, chatId } = action.payload;
      if (state[0]?.chat === chatId) {
        const reqIndex = state.findIndex(m => m._id === messageId);
        if (reqIndex !== -1) {
          state[reqIndex] = { ...state[reqIndex], content: "", messageType: MessageTypes.DELETED }
          if (state[reqIndex].blobUrl) {
            state[reqIndex].blobUrl = "";
          }
        }
      }
    },


    changeChatIdOfMessagesToVerified: (state, action) => {
      const { verifiedChatId, oldId } = action.payload;
      if (verifiedChatId !== oldId) {
        const updatedChatIdMessages = state.map(m => ({ ...m, chat: verifiedChatId }))
        return updatedChatIdMessages;
      }
    },

    markMessageFailedToSend: (state, action) => {
      const { messageId } = action.payload;
      const reqIndex = state.findIndex(m => m._id === messageId);
      if (reqIndex !== -1) {
        if (state[reqIndex].notSent) {
          state[reqIndex].notSent = false;
          state[reqIndex].failedToSend = true;
        }

      }
    },

    updateMessageField: (state, action) => {
      const { messageId, ...updatedFields } = action.payload;
      const reqIndex = state.findIndex(m => m._id === messageId);
      if (reqIndex !== -1) {
        state[reqIndex] = { ...state[reqIndex], ...updatedFields }
      }
    },

    replaceBlobUrlForMessage: (state, action) => {
      const { messageId, newBlobUrl } = action.payload;
      const reqIndex = state.findIndex(m => m._id === messageId);
      if (reqIndex !== -1) {
        state[reqIndex] = { ...state[reqIndex], blobUrl: newBlobUrl }
      }
    }

  }
});

export default messagesSlice.reducer;

export const {
  setMessages,
  addMessage,
  addMessagesAtEnd,
  addMessagesAtStart,
  addWaitingMessages,
  updateMessage,
  resetMessages,
  setMessageSentStatus,
  setMessageDeliveredAndSeenStatus,
  purgeMessagesFromBottom,
  purgeMessagesFromTop,
  markMessageDeleted,
  changeChatIdOfMessagesToVerified,
  markMessageFailedToSend,
  updateMessageField,
  replaceBlobUrlForMessage
} = messagesSlice.actions;
