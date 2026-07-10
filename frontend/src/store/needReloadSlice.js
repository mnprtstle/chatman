import { createSlice } from "@reduxjs/toolkit";

const initialState = false;

const needReloadSlice = createSlice({
    name: "needReload",
    initialState,

    reducers: {

        turnOnNeedReload: () => {
            return true;
        },

        resetNeedReload: () => {
            return false;
        }

    }
});

export default needReloadSlice.reducer;

export const {
    turnOnNeedReload,
    resetNeedReload
} = needReloadSlice.actions;