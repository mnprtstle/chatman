import { createSlice } from "@reduxjs/toolkit";
import { LocalStorage } from "../utils";

const initialState = {
  account: null
}

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    login: (state, action) => {
      state.account = action.payload?.user;
    },

    updateAvatar: (state, action) => {
      state.account.avatar = { url: action.payload }
    },

    logout: (state) => {
      state.account = null;
    },

    checkCredentials: (state, action) => {
      state.account = action.payload;
    }
  }
})

export default authSlice.reducer;

export const { login, updateAvatar, logout, checkCredentials } = authSlice.actions;
