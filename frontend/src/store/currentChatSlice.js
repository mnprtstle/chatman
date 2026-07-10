import { createSlice } from "@reduxjs/toolkit";

const initialState = null;

const currentChatSlice = createSlice({
  name: "currentChat",
  initialState,

  reducers: {
    setCurrentChat: (_, action) => {
      return action.payload;
    },


    udpateCurrentChatName: (state, action) => {
      const { chatId, chatRevision, updatedName } = action.payload;
      if (state?._id.toString() === chatId.toString()) {
        state.name = updatedName;
        state.revision = chatRevision;
      }
    },


    udpateCurrentChatPhoto: (state, action) => {
      const { updatedDisplayPhoto, chatId, chatRevision } = action.payload;
      if (state?._id.toString() === chatId.toString()) {
        state.displayPhoto = updatedDisplayPhoto;
        state.revision = chatRevision;
      }
    },


    resetCurrentChat: () => {
      return null
    },


    makeCurrentChatDeletedIfMatches: (state, action) => {
      const { chatId, chatRevision } = action.payload;
      if (state?._id?.toString() === chatId) {
        state.isDeleted = true;
        state.revision = chatRevision;
      }
    },


    updateCurrentChatOutOfAllChatsIfNeeded: (state, action) => {
      if (state?._id) {
        return action.payload.find(chat => chat._id.toString() === state._id.toString())
      }
    },


    updateCurrentChat: (state, action) => {
      if (state?._id && (action.payload._id === state._id) && (!state.revision || (state.revision < action.payload.revision))) {
        return { ...action.payload, lastMessage: state.lastMessage };
      }
    },


    updateOrTransferCurrentChatIfNeeded: (state, action) => {
      const { newChat, oldId } = action.payload;
      if (state?._id && ((newChat._id === state._id) || (oldId === state._id))) {
        return { ...newChat, lastMessage: state.lastMessage };
      }
    },


    updateCurrentChatOtherParticipantAvatar: (state, action) => {
      if (state?._id.toString() === action.payload.chatId) {
        state.displayPhoto = action.payload.avatar;
      }
    },


    updateCurrentChatOtherParticipantProfile: (state, action) => {
      const { chatId, profile } = action.payload;
      if (state?._id.toString() === chatId) {
        return {
          ...state, displayPhoto: profile.avatar, name: profile.fullName, lastUpdated: profile.lastUpdated
        }
      }
    },


    exitMemberFromChatIfCurrent: (state, action) => {
      const { chatId, chatRevision } = action.payload;
      if (state?._id === chatId) {
        state.notAMember = true;
        if (chatRevision) {
          state.revision = chatRevision;
        }
      }
    },


    updateFieldsInCurrentChat: (state, action) => {
      const { updatedFields, chatId } = action.payload;

      if (state?._id === chatId) {
        state = { ...state, ...updatedFields }
      }
    },


    removePossiblyInaccurateRevisionFromCurrentChat: (state, action) => {
      if (state?._id === action.payload) {
        state.possiblyInaccurateRevision = false;
      }
    },


    addProfiles: (state, action) => {
      const { newProfiles, chatId } = action.payload;
      if (state?._id === chatId) {
        if (state?.userProfilesObject) {
          state.userProfilesObject = { ...state.userProfilesObject, ...newProfiles }
        } else {
          state.userProfilesObject = newProfiles;
        }
      }
    },


    addProfile: (state, action) => {
      const { profile, chatId } = action.payload;
      if (state?._id === chatId) {
        const { _id, ...profileExceptId } = profile;
        if (state?.userProfilesObject) {
          state.userProfilesObject[_id] = profileExceptId;
        } else {
          state.userProfilesObject = { [_id]: profileExceptId }
        }
      }
    },


    setAvatar: (state, action) => {
      const { chatId, userId, avatar } = action.payload;
      if (state?._id === chatId) {
        if (state.userProfilesObject?.[userId]) {
          state.userProfilesObject[userId] = { ...state.userProfilesObject[userId], avatar }
        }
      }
    },


    updateUnreadCountToZeroForCurrentChat: (state, action) => {
      if (state?._id === action.payload) {
        state.unreadCount = 0;
      }
    },


    makeCurrentChatVerified: (state, action) => {
      const { verifiedChatId, oldId, chatRevision } = action.payload;
      if (state?._id === oldId) {
        state._id = verifiedChatId;
        if (!state.revision) {
          state.revision = chatRevision;
        }
        state.notVerified = false;
      }
    },


    updateCurrentChatRevision: (state, action) => {
      const { chatId, chatRevision } = action.payload;
      if (state?._id === chatId) {
        state.revision = chatRevision;
      }
    }

  }
});

export default currentChatSlice.reducer;

export const {
  setCurrentChat,
  udpateCurrentChatName,
  udpateCurrentChatPhoto,
  resetCurrentChat,
  makeCurrentChatDeletedIfMatches,
  updateCurrentChatOutOfAllChatsIfNeeded,
  updateCurrentChat,
  updateOrTransferCurrentChatIfNeeded,
  updateCurrentChatOtherParticipantAvatar,
  updateCurrentChatOtherParticipantProfile,
  exitMemberFromChatIfCurrent,
  updateFieldsInCurrentChat,
  removePossiblyInaccurateRevisionFromCurrentChat,
  addProfiles,
  addProfile,
  setAvatar,
  updateUnreadCountToZeroForCurrentChat,
  makeCurrentChatVerified,
  updateCurrentChatRevision,
} = currentChatSlice.actions;
