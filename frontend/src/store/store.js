import { configureStore } from "@reduxjs/toolkit";
import authSlice from "./authSlice";
import chatsSlice from "./chatsSlice";
import currentChatSlice from "./currentChatSlice";
import expandedImageSlice from "./expandedImageSlice";
import groupInfoSlice from "./groupInfoSlice";
import otherUserPresenceSlice from "./otherUserPresenceSlice";
import messagesSlice from "./messagesSlice";
import needReloadSlice from "./needReloadSlice";
import purgedStatusSlice from "./purgedStatusSlice";
import typingUsersSlice from "./typingUsersSlice";

const store = configureStore({
  reducer: {
    auth: authSlice,
    chats: chatsSlice,
    currentChat: currentChatSlice,
    expandedImage: expandedImageSlice,
    groupInfo: groupInfoSlice,
    otherUserPresence: otherUserPresenceSlice,
    messages: messagesSlice,
    needReload: needReloadSlice,
    purgedStatus: purgedStatusSlice,
    typingUsers: typingUsersSlice
  }
})

export default store;
