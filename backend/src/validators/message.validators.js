import { body, query } from "express-validator";
import { MessageTypes } from "../constants.js";


export const messagePayloadValidator = () => {
  return [
    body("receiverId").notEmpty().isMongoId().withMessage("Invalid receiverId"),
    body("messagePayload._id").notEmpty().isMongoId().withMessage("Invalid receiverId"),
    body("messagePayload.content").trim().notEmpty().isLength({ min: 1, max: 2000 }).withMessage("The message length must be between 1 and 2000 characters"),
    body("messagePayload.chat").notEmpty().isMongoId().withMessage("Invalid chatId"),
    body("chatCreationTime").notEmpty().custom((value) => {

      const ms = parseInt(value);
      if (isNaN(ms)) {
        throw new Error('Timestamp must be a valid number');
      }

      const date = new Date(ms);
      if (date.toString() === 'Invalid Date') {
        throw new Error('Timestamp is an invalid date');
      }

      if (ms < 0) {
        throw new Error('Timestamp must be a positive integer (since 1970)');
      }

      return true;
    })
      .withMessage("Invalid chatCreationTime")
  ]
}

export const validateQueryParametersForDeletion = (messageType, attachmentName) => {
  return [
    query(messageType)
      .optional()
      .isIn([MessageTypes.FILE, MessageTypes.IMAGE, MessageTypes.VOICE]).withMessage(''),

    query(attachmentName)
      .optional()
      .isString().withMessage('messagetype must be a string')
      .trim(),

  ]
}

