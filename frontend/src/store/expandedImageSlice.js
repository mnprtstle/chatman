import { createSlice } from "@reduxjs/toolkit";

const initialState = ""

const expandedImageSlice = createSlice({
    name: "expandedImage",
    initialState,

    reducers: {
        setExpandedImage: (_, action) => {
            return action.payload;
        },
    }
})

export default expandedImageSlice.reducer;

export const { setExpandedImage } = expandedImageSlice.actions;