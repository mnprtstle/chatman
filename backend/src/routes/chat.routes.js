import { Router } from "express";
import {
  addNewParticipantInGroupChat,
  createAGroupChat,
  createOrGetAOneOnOneChat,
  deleteGroupChat,
  getAllChats,
  getBriefChatInfo,
  getChatInfo,
  getDP,
  getParticipantAvatar,
  getParticipantProfile,
  leaveGroupChat,
  removeParticipantFromGroupChat,
  renameGroupChat,
  searchAvailableUsers,
  updateChatDisplayPhoto,
  getChatInfoWithoutProfiles,
  checkChatAvailabilityForUser
} from "../controllers/chat.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
  createAGroupChatValidator,
  createOrGetAOneOnOneChatValidator,
  updateGroupChatNameValidator,
} from "../validators/chat.validators.js";
import { mongoIdPathVariableValidator } from "../validators/mongodb.validators.js";
import { validate } from "../validators/body.validators.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.use(verifyJWT);

router.route("/").get(getAllChats);

router.route("/users").get(searchAvailableUsers);

router
  .route("/chat/:chatId")
  .get(
    mongoIdPathVariableValidator("chatId"),
    validate,
    getChatInfo
  );

router
  .route("/chat_wo_profiles/:chatId")
  .get(
    mongoIdPathVariableValidator("chatId"),
    validate,
    getChatInfoWithoutProfiles
  )


router
  .route("/bchat/:chatId")
  .get(
    mongoIdPathVariableValidator("chatId"),
    validate,
    getBriefChatInfo
  );

router
  .route("/create_or_get")
  .post(
    createOrGetAOneOnOneChatValidator(),
    validate,
    createOrGetAOneOnOneChat
  );

router
  .route("/group")
  .post(
    createAGroupChatValidator(),
    validate,
    createAGroupChat
  );

router
  .route("/group/:chatId")
  .patch(
    mongoIdPathVariableValidator("chatId"),
    updateGroupChatNameValidator(),
    validate,
    renameGroupChat
  )
  .delete(mongoIdPathVariableValidator("chatId"), validate, deleteGroupChat);

router
  .route("/group/add-participants/:chatId")
  .post(
    mongoIdPathVariableValidator("chatId"),
    validate,
    addNewParticipantInGroupChat
  )

router
  .route("/group/remove-participants/:chatId")
  .delete(
    mongoIdPathVariableValidator("chatId"),
    validate,
    removeParticipantFromGroupChat
  );

router
  .route("/leave/group/:chatId")
  .delete(
    mongoIdPathVariableValidator("chatId"),
    validate,
    leaveGroupChat
  );

router
  .route("/group/photo/:chatId")
  .post(
    upload.fields([{ name: "dpLg", maxCount: 1 }, { name: "dpSm", maxCount: 1 }]),
    mongoIdPathVariableValidator("chatId"),
    validate,
    updateChatDisplayPhoto
  );

router
  .route("/getdp/:dpName")
  .get(
    getDP
  );

router
  .route("/get_profile/:userId")
  .get(
    mongoIdPathVariableValidator("userId"),
    getParticipantProfile
  );

router
  .route("/get_avatar/:userId")
  .get(
    mongoIdPathVariableValidator("userId"),
    getParticipantAvatar
  );

router
  .route("/check_chat_availability/:chatId")
  .get(
    mongoIdPathVariableValidator("chatId"),
    checkChatAvailabilityForUser
  )


export default router;
