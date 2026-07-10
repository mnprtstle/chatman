import mongoose, { Schema } from "mongoose";

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
      required: true
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
