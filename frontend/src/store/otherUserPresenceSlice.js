import { createSlice } from "@reduxjs/toolkit";
import { ChatStatusEnum } from "../constants";

const initialState = {
    id: "",
    online: ChatStatusEnum.UNKNOWN,
    lastSeen: null
}

const otherUserPresenceSlice = createSlice({
    name: "otherUserPresence",
    initialState,

    reducers: {
        updateOtherUserPresence: (_, action) => {
            return action.payload;
        },

        changeOtherUser: (state, action) => {
            if(!action.payload?.toString()) {
                return {
                    id: "",
                    online: ChatStatusEnum.UNKNOWN,
                    lastSeen: null
                }
            } else if (state.id !== action.payload.toString()) {
                return {
                    id: action.payload.toString(),
                    online: ChatStatusEnum.UNKNOWN,
                    lastSeen: null
                }
            } 
        }
    }
})

export default otherUserPresenceSlice.reducer;

export const { updateOtherUserPresence, changeOtherUser } = otherUserPresenceSlice.actions;