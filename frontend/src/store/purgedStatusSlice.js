import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  chatId: "",
  topPurged: true,
  bottomPurged: false,
  needScrollShiftForBottomPurge: false,
  needScrollShiftForBottomLoad: false
};

const purgedStatusSlice = createSlice({
  name: "purgedStatus",
  initialState,

  reducers: {
    initializePurgedStatusForChatId: (_, action) => {
      return {
        chatId: action.payload,
        topPurged: true,
        bottomPurged: false
      }
    },

    setBottomPurged: (state, action) => {
      if (state.chatId === action.payload) {
        state.bottomPurged = true;
      }
    },

    unsetBottomPurged: (state, action) => {
      if (state.chatId === action.payload) {
        state.bottomPurged = false;
      }
    },

    setTopPurged: (state, action) => {
      if (state.chatId === action.payload) {
        state.topPurged = true;
      }
    },

    unsetTopPurged: (state, action) => {
      if (state.chatId === action.payload) {
        state.topPurged = false;
      }
    },

    setNeedScrollShiftForBottomPurge: (state, action) => {
      if (action.payload === state.chatId) {
        state.needScrollShiftForBottomPurge = true;
      }
    },

    unsetNeedScrollShiftForBottomPurge: (state, action) => {
      if (action.payload === state.chatId) {
        state.needScrollShiftForBottomPurge = false;
      }
    },

    setNeedScrollShiftForBottomLoad: (state, action) => {
      if (action.payload === state.chatId) {
        state.needScrollShiftForBottomLoad = true;
      }
    },

    unsetNeedScrollShiftForBottomLoad: (state, action) => {
      if (action.payload === state.chatId) {
        state.needScrollShiftForBottomLoad = false;
      }
    }

  }
})

export default purgedStatusSlice.reducer;

export const {
  initializePurgedStatusForChatId,
  setBottomPurged,
  unsetBottomPurged,
  setTopPurged,
  unsetTopPurged,
  setNeedScrollShiftForBottomPurge,
  unsetNeedScrollShiftForBottomPurge,
  setNeedScrollShiftForBottomLoad,
  unsetNeedScrollShiftForBottomLoad
} = purgedStatusSlice.actions;
