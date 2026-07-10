import { Router } from "express";
import {
  ackEvent,
  deleteMessage,
  msgAckEvent,
  sendMessageForUnverifiedChat,
} from "../controllers/message.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { mongoIdPathVariableValidator } from "../validators/mongodb.validators.js";
import { validateQueryParametersForDeletion, messagePayloadValidator } from "../validators/message.validators.js";
import { validate } from "../validators/body.validators.js";

const router = Router();

router.use(verifyJWT);

router
  .route("/:chatId/:messageId")
  .delete(
    mongoIdPathVariableValidator("chatId"),
    mongoIdPathVariableValidator("messageId"),
    validateQueryParametersForDeletion("messagetype", "attachmentname"),
    validate,
    deleteMessage
  );

router
  .route("/send_message_for_unverified_chat")
  .post(
    messagePayloadValidator(),
    validate,
    sendMessageForUnverifiedChat
  )

router
  .route("/msg_ack_event")
  .post(
    msgAckEvent
  )

router
  .route("/ack_event")
  .post(
    ackEvent
  )

export default router;
