import { createSlice } from "@reduxjs/toolkit";

const initialState = null

const groupInfoSlice = createSlice({
    name: "chats",
    initialState,

    reducers: {
        loadGroupInfo: (_, action) => {
            return { chat: action.payload }
        },

        updateGroupInfo: (state, action) => {
            if (state?.chat._id.toString() === action.payload.chat._id.toString()) {
                return action.payload;
            }
        },

        removeNofifyingMessage: (state, _) => {
            return { chat: state.chat }
        },

        resetSlice: () => {
            return null;
        },

    }
})

export default groupInfoSlice.reducer;

export const { loadGroupInfo, updateGroupInfo, removeNofifyingMessage, resetSlice } = groupInfoSlice.actions;
