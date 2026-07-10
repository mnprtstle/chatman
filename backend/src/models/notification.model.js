import mongoose, { Schema } from "mongoose";
import { AvailableChatEvents } from "../constants.js";

const notificationSchema = new Schema({
  _id: { type: String },

  notificationType: {
    type: String,
    enum: AvailableChatEvents,
  },

  messageToSend: Schema.Types.Mixed,

  receivingUsers: [
    {
      type: Schema.Types.ObjectId,
      ref: "User"
    }
  ],

}, {
  timestamps: true,
  toJSON: {
    transform: (_, ret) => {
      ret.createdAt = ret.createdAt.getTime();
      ret.updatedAt = ret.updatedAt.getTime();
      return ret;
    }
  }
});

export const Notification = mongoose.model("Notification", notificationSchema);
