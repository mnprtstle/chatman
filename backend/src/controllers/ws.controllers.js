import { Chat } from "../models/chat.model.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";


const validateSender = asyncHandler(async (req, res) => {
  const { chatId, senderId } = req.body;
  const chatExists = await Chat.findOne({ _id: chatId, participants: senderId });

  if (!chatExists) {

    return res
      .status(200)
      .json(
        new ApiResponse(200, {
          senderIsMember: 0,
          chatMembers: []
        }, "Chat not found")
      );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, {
        senderIsMember: 1,
        chatMembers: chatExists.participants
      }, "Chat members list")
    )

});

const lookupChat = asyncHandler(async (req, res) => {
  const chatId = req.params.chatId;
  const chat = await Chat.findById(chatId).select("participants");

  return res
    .status(200)
    .json(
      new ApiResponse(200, chat, "Chat Members list")
    )
})


const getLastOnline = asyncHandler(async (req, res) => {
  const userId = req.params.userId;

  const result = await User.findById(userId).select("lastOnline");

  res.json(
    new ApiResponse(200, result)
  );
});

const verifyUserToken = asyncHandler(async (req, res) => {
  const token = req.body.userToken;

  if (!token) {
    res.json(
      new ApiResponse(200, {})
    );
    return;
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    res.json(
      new ApiResponse(200, { decodedToken })
    );
    return;

  } catch (error) {
    console.log("error occured on token: ", token);
    res.json(
      new ApiResponse(200, {})
    );
    return;
  }

});

const getSequenceIdForChat = asyncHandler(async (req, res) => {
  const lastSequenceId = await Chat.findById(req.params.chatId).select("lastSequenceId");
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        lastSequenceId,
        "lastSequenceId fetched successfully"
      )
    );

});



export {
  validateSender,
  lookupChat,
  getLastOnline,
  verifyUserToken,
  getSequenceIdForChat

}
