import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AvatarSize, UserLoginType } from "../constants.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";
import { gfsBucketDP } from "../db/index.js";
import { Chat } from "../models/chat.model.js";
import { Notification } from "../models/notification.model.js";
import { redisCache } from "../utils/redis.js";
import { timestampMsConversion } from "../utils/helpers.js";


const conn = mongoose.connection;

//convert days to milliseconds for Max-age of cookies
const accessTokenMaxAge = (process.env.ACCESS_TOKEN_EXPIRY_DAYS ?? 1) * 24 * 60 * 60 * 1000;
const refreshTokenMaxAge = (process.env.REFRESH_TOKEN_EXPIRY_DAYS ?? 10) * 24 * 60 * 60 * 1000;

const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
}

async function clearNotificationsForUser(userId) {
  try {
    const bulkOperations = [
      {
        deleteMany: {
          filter: { receivingUsers: [userId] }
        }
      },
      {
        updateMany: {
          filter: {
            receivingUsers: userId,
            "receivingUsers.1": { $exists: true }
          },
          update: { $pull: { receivingUsers: userId } }
        }
      }
    ];

    await Notification.bulkWrite(bulkOperations);


  } catch (error) {
    console.log("could not clear notifications", error);
  }
}


const generateAccessAndRefreshTokens = async (user) => {
  try {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating the access token"
    );
  }
};



const fetchChatsFromDb = async req => (
  await Chat.aggregate([
    {
      $match: {
        participants: { $elemMatch: { $eq: new mongoose.Types.ObjectId(req.user._id) } },
      },
    },
    {
      $sort: {
        updatedAt: -1,
      },
    }, {
      $addFields: {


        participants: {
          $cond: [{ $eq: ["$isGroupChat", true] }, [
            { $arrayElemAt: ["$participants", 0] }, { $arrayElemAt: ["$participants", 1] }, { $arrayElemAt: ["$participants", 2] }
          ],
            "$participants"]


        }

      }
    },
    ...timestampMsConversion()
  ])
);

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists", []);
  }


  const user = await User.create({
    email,
    password,
    username,
    fullName,
    isEmailVerified: false,
  });

  //email verification logic
  const { unHashedToken, hashedToken, tokenExpiry } = user.generateTemporaryToken();
  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpiry = tokenExpiry;
  await user.save({ validateBeforeSave: false });


  const { password: _omitPassord, refreshToken: _refreshToken, emailVerificationToken: _emailVerificationToken, emailVerificationExpiry: _emailVerificationExpiry, ...createdUser } = user.toObject();

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        200,
        { user: createdUser },
        "Users registered successfully and verification email has been sent on your email."
      )
    );
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  if (!username && !email) {
    throw new ApiError(400, "Username or email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });


  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // If user is registered with some other method, we will ask them to use the same method as registered.
  if (user.loginType !== UserLoginType.EMAIL_PASSWORD) {
    throw new ApiError(
      400,
      "You have previously registered using " +
      user.loginType?.toLowerCase() +
      ". Please use the " +
      user.loginType?.toLowerCase() +
      " login option to access your account."
    );
  }

  // Compare the incoming password with hashed password
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);
  const { password: _omitPassord, refreshToken: _refreshToken, emailVerificationToken: _emailVerificationToken, emailVerificationExpiry: _emailVerificationExpiry, ...loggedInUser } = user.toObject();

  return res
    .status(200)
    .cookie("accessToken", accessToken, { ...authCookieOptions, path: "/", maxAge: accessTokenMaxAge })
    .cookie("refreshToken", refreshToken, { ...authCookieOptions, path: "/api/v1/users/refresh-token", maxAge: refreshTokenMaxAge })
    .json(
      new ApiResponse(
        200,
        {
          accessToken,
          refreshToken,
          user: loggedInUser,
        }, // send access and refresh token in response if client decides to save them by themselves
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id, {
    $set: { refreshToken: '' },
  }, { new: true }
  );

  return res
    .status(200)
    .clearCookie("accessToken", { ...authCookieOptions, path: "/" })
    .clearCookie("refreshToken", { ...authCookieOptions, path: "/api/v1/users/refresh-token" })
    .json(new ApiResponse(200, {}, "User logged out"));
});


const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      // If token is valid but is used already
      throw new ApiError(401, "Refresh token is expired or used");
    }


    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user);

    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    return res
      .status(200)
      .cookie("accessToken", accessToken, { ...authCookieOptions, path: "/", maxAge: accessTokenMaxAge })
      .cookie("refreshToken", newRefreshToken, { ...authCookieOptions, path: "/api/v1/users/refresh-token", maxAge: refreshTokenMaxAge })
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});



const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  if (user.loginType !== UserLoginType.EMAIL_PASSWORD) {
    throw new ApiError(400, "Bad request, cannot change password for social login")
  }
  const isPasswordValid = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid old password");
  }
  if (oldPassword === newPassword) {
    throw new ApiError(400, "New password must be different from the old one!")
  }
  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select("-password -refreshToken -emailVerificationToken -emailVerificationExpiry");
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Current user fetched successfully"));
});

const handleSocialLogin = asyncHandler(async (req, res) => {

  const user = await User.findById(req.user?._id);
  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);


  return res
    .status(301)
    .cookie("accessToken", accessToken, { ...authCookieOptions, path: "/", maxAge: accessTokenMaxAge })
    .cookie("refreshToken", refreshToken, { ...authCookieOptions, path: "/api/v1/users/refresh-token", maxAge: refreshTokenMaxAge })
    .redirect(
      process.env.CLIENT_SSO_REDIRECT_URL
    );
});

const updateUserAvatar = asyncHandler(async (req, res) => {

  if (!req.files?.dpLg?.[0] || !req.files?.dpSm?.[0]) {
    throw new ApiError(400, "Avatar image is required");
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(403, "User not authorized to perform this action");
  }

  if (!gfsBucketDP) {
    throw new ApiError(500, "Bucket not initialized, please try again");
  }



  const images = [req.files.dpLg[0], req.files.dpSm[0]];
  const uploadedName = `${Date.now()}-dp-${images[0].originalname}`
  // Create an array of upload promises
  const uploadPromises = images.map((file, i) => {
    return new Promise((resolve, reject) => {
      // Validation
      if (file.mimetype !== "image/webp") {
        return reject(new Error(`Invalid type for ${file.originalname}`));
      }

      const size = i === 0 ? AvatarSize.LG : AvatarSize.SM;
      const fullUploadedName = `${uploadedName}_${size}`;

      const uploadStream = gfsBucketDP.openUploadStream(fullUploadedName, {
        contentType: file.mimetype
      });

      uploadStream.end(file.buffer);

      uploadStream.on('finish', () => {
        resolve({ fileId: uploadStream.id, filename: fullUploadedName });
      });

      uploadStream.on('error', (err) => reject(new ApiError(500, "Upload Failed")));
    });
  });

  // Wait for all memory buffers to finish writing to MongoDB
  await Promise.all(uploadPromises);

  let updatedUser = await User.findByIdAndUpdate(
    req.user._id, {
    $set: {
      avatar: {
        url: uploadedName,
      }
    },
  }, { new: true })
    .select(
      "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
    );

  // remove the old avatar
  if (user.avatar?.url) {
    const dpDocsCursor = conn.db.collection('dp.files').find({
      filename: {
        $in: [`${user.avatar.url}_${AvatarSize.LG}`, `${user.avatar.url}_${AvatarSize.SM}`]
      }
    });

    if (dpDocsCursor) {
      for await (const doc of dpDocsCursor) {
        await gfsBucketDP.delete(doc._id);

      }
    }
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedUser, "Avatar updated successfully"));


});


const getBloomFilterSeed = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  const hmac = crypto.createHmac('sha256', process.env.BLOOM_FILTER_SEED_GENERATING_SEED);
  hmac.update(userId);

  const seedInNumber = hmac.digest().readUInt32BE(0);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        seedInNumber,
        "bloomHashSeed retrieved successfully"
      )
    );


});

const appLaunchSyncFunction = asyncHandler(async (req, res) => {
  const clientInfo = req.cookies?.clientInfo || req.header("client-info");

  const CLIENTS_DIFFER_PROBLEM = "It looks like that the previous login for this account was probably on a different device. Previous chat history will not be accessible on this device and any new chats and messages from this device may not be accessible on any other logged in device."


  const clientInboxAndNotifications = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      }
    }, {
      $lookup: {
        from: "chatmessages",
        foreignField: "receivingUsers",
        localField: "_id",
        as: "inbox",
        pipeline: [{
          $sort: { createdAt: 1 }
        }, {
          $project: {
            receivingUsers: 0
          }
        },
        ...timestampMsConversion()],
      }
    }, {
      $project: {
        client: 1,
        inbox: 1
      }
    }
  ]);


  const inbox = clientInboxAndNotifications[0]?.inbox;
  const currentClient = clientInboxAndNotifications[0]?.client;

  const redisInboxFetch = await redisCache.getInboxMessagesForUser(req.user._id);

  let redisInbox;
  if (!redisInboxFetch.failed) {
    redisInbox = redisInboxFetch.result;
  }

  if (clientInfo?.userId && clientInfo?.clientId && currentClient) {
    if ((clientInfo.userId === req.user?._id.toString()) && (Number(clientInfo?.clientId) === currentClient)) {
      //same client, can continue

      const notifications = await Notification.find({
        receivingUsers: req.user._id
      }).sort({ createdAt: 1 }).select("-receivingUsers");

      const redisNotificationsFetch = await redisCache.getNotificationsForUser(req.user._id);
      let redisNotifications;
      if (!redisNotificationsFetch?.failed) {
        redisNotifications = redisNotificationsFetch.result
      }

      const newClientInfo = {
        userId: req.user._id.toString(),
        clientId: clientInfo.clientId
      }

      return res
        .status(200)
        .cookie("clientInfo", newClientInfo, { ...authCookieOptions, maxAge: 34560000 * 1000, path: "/api/v1/users/app_launch_sync" })
        .json(
          new ApiResponse(
            200,
            {
              inbox,
              notifications,
              redisInbox,
              redisNotifications
            },
            "ClientId on the browser matched for the user"
          )
        );
    } else if (clientInfo.userId === req.user?._id.toString()) {
      //same user but different client
      await clearNotificationsForUser(req.user?._id);

      const newClientInfo = {
        userId: req.user._id.toString(),
        clientId: clientInfo.clientId
      }

      await User.findByIdAndUpdate(req.user._id, {
        $set: { client: newClientInfo.clientId }
      });

      const chats = await fetchChatsFromDb(req);


      return res
        .status(200)
        .cookie("clientInfo", newClientInfo, { ...authCookieOptions, maxAge: 34560000 * 1000, path: "/api/v1/users/app_launch_sync" })
        .json(
          new ApiResponse(
            200,
            {
              clientInfo: newClientInfo,
              problem: CLIENTS_DIFFER_PROBLEM,
              chats,
              inbox,
              redisInbox
            }
          )
        )
    } else {
      //users different
      await clearNotificationsForUser(req.user?._id);

      const newClientInfo = {
        userId: req.user._id.toString(),
        clientId: currentClient + 1
      }

      await User.findByIdAndUpdate(req.user._id, {
        $set: { client: newClientInfo.clientId }
      });

      const chats = await fetchChatsFromDb(req);


      return res
        .status(200)
        .cookie("clientInfo", newClientInfo, { ...authCookieOptions, maxAge: 34560000 * 1000, path: "/api/v1/users/app_launch_sync" })
        .json(
          new ApiResponse(
            200,
            {
              clientInfo: newClientInfo,
              problem: CLIENTS_DIFFER_PROBLEM,
              chats,
              inbox,
              redisInbox
            }
          )
        );
    }
  } else if (!clientInfo?.userId && currentClient) {
    //user logged in different client, this comp never logged in anywhere
    await clearNotificationsForUser(req.user?._id);

    const newClientInfo = {
      userId: req.user._id.toString(),
      clientId: currentClient + 1
    }

    await User.findByIdAndUpdate(req.user._id, {
      $set: { client: newClientInfo.clientId }
    });

    const chats = await fetchChatsFromDb(req);

    return res
      .status(200)
      .cookie("clientInfo", newClientInfo, { ...authCookieOptions, maxAge: 34560000 * 1000, path: "/api/v1/users/app_launch_sync" })
      .json(
        new ApiResponse(
          200,
          {
            clientInfo: newClientInfo,
            problem: CLIENTS_DIFFER_PROBLEM,
            chats,
            inbox,
            redisInbox
          }
        )
      );

  } else if (clientInfo?.userId && !currentClient) {
    //device had different account logged in, no logins for the account previously
    await clearNotificationsForUser(req.user?._id);

    const newClientInfo = {
      userId: req.user._id.toString(),
      clientId: 1
    }

    await User.findByIdAndUpdate(req.user._id, {
      $set: { client: newClientInfo.clientId }
    });

    const chats = await fetchChatsFromDb(req);


    return res
      .status(200)
      .cookie("clientInfo", newClientInfo, { ...authCookieOptions, maxAge: 34560000 * 1000, path: "/api/v1/users/app_launch_sync" })
      .json(
        new ApiResponse(
          200,
          {
            clientInfo: newClientInfo,
            chats,
            inbox,
            redisInbox
          }
        )
      )
  } else {
    //first ever login for user and device
    await clearNotificationsForUser(req.user?._id);

    //generate the clientId and pass it back to be stored in cookies
    const newClientInfo = {
      userId: req.user._id.toString(),
      clientId: 1
    }

    await User.findByIdAndUpdate(req.user._id, {
      $set: { client: newClientInfo.clientId }
    });

    const chats = await fetchChatsFromDb(req);

    // need chat data if the client isnt the same


    return res
      .status(200)
      .cookie("clientInfo", newClientInfo, { ...authCookieOptions, maxAge: 34560000 * 1000, path: "/api/v1/users/app_launch_sync" })
      .json(
        new ApiResponse(
          200,
          {
            clientInfo: newClientInfo,
            chats,
            inbox,
            redisInbox
          },
          "User logged in successfully"
        )
      );
  }



});


export {
  changeCurrentPassword,
  getCurrentUser,
  handleSocialLogin,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateUserAvatar,
  getBloomFilterSeed,
  appLaunchSyncFunction,
};

