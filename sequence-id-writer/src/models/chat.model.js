import mongoose, { Schema } from "mongoose";

const chatSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    lastSequenceId: {
      type: Number
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    displayPhoto: {
      url: String
    }
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

export const Chat = mongoose.model("Chat", chatSchema);
