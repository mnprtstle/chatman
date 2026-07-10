import { Router } from "express";
import { mongoIdPathVariableValidator, mongoIdRequestBodyValidator } from "../validators/mongodb.validators.js";
import { validate } from "../validators/body.validators.js";
import { verifyWS } from "../middlewares/ws.middleware.js";
import { getLastOnline, getSequenceIdForChat, lookupChat, validateSender, verifyUserToken } from "../controllers/ws.controllers.js";

const router = Router();

router.use(verifyWS);

router
  .route("/validate_sender")
  .post(
    mongoIdRequestBodyValidator("chatId"),
    mongoIdRequestBodyValidator("senderId"),
    validate,
    validateSender
  );

router
  .route("/lookup_chat/:chatId")
  .get(
    mongoIdPathVariableValidator("chatId"),
    validate,
    lookupChat
  )

router
  .route("/last_seen/:userId")
  .get(
    mongoIdPathVariableValidator("userId"),
    validate,
    getLastOnline
  );

router
  .route("/verify_token")
  .post(
    verifyUserToken
  )

router
  .route("/get_sequence_id/:chatId")
  .get(
    mongoIdPathVariableValidator("chatId"),
    getSequenceIdForChat
  )


export default router;
