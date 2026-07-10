import mongoose, { Schema } from "mongoose";
import {
  UserLoginType,
  AvailableSocialLogins,
} from "../constants.js";

const userSchema = new Schema(
  {
    avatar: {
      url: String,
      ssoUrl: String,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    lastOnline: {
      type: Date,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    loginType: {
      type: String,
      enum: AvailableSocialLogins,
      default: UserLoginType.EMAIL_PASSWORD,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    refreshToken: {
      type: String,
    },
    forgotPasswordToken: {
      type: String,
    },
    forgotPasswordExpiry: {
      type: Date,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpiry: {
      type: Date,
    },
    client: {
      type: Number,
      required: false
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




export const User = mongoose.model("User", userSchema);
