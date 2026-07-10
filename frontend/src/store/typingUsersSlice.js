import { createSlice } from "@reduxjs/toolkit";
// stores a maxiumum of 3 typing users' ids per chat
const initialState = {}

const typingUsersSlice = createSlice({
  name: "typingUsers",
  initialState,

  reducers: {
    addTypingUser: (state, action) => {
      const { userId, chatId } = action.payload;
      if (!state[chatId]) {
        state[chatId] = [userId];
      } else {
        if ((state[chatId].length < 3) && !state[chatId].includes(userId)) {
          state[chatId].push(userId);
        }
      }
    },

    removeTypingUser: (state, action) => {
      const { userId, chatId } = action.payload;
      if (state[chatId]) {
        state[chatId] = state[chatId].filter(id => id !== userId);
      }
    }
  }
})

export default typingUsersSlice.reducer;

export const { addTypingUser, removeTypingUser } = typingUsersSlice.actions;
