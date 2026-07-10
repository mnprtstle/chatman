import mongoose, { Schema } from "mongoose";
import { AvailableMessageTypes } from "../constants.js";



const chatMessageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    content: {
      type: String
    },
    attachmentName: {
      type: String,
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true
    },
    sequenceId: {
      type: Number,
      required: true
    },
    messageType: {
      type: String,
      required: true,
      enum: AvailableMessageTypes
    },
    audioDuration: {
      type: Number
    },
    receivingUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        ret.createdAt = ret.createdAt.getTime();
        ret.updatedAt = ret.updatedAt.getTime();
        return ret;
      }
    }
  }
);

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
