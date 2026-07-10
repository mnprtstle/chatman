import { Router } from "express";
import {
  uploadFile,
  getFile,
  deleteFile,
  sendFailedToSendOnError,
} from "../controllers/file.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { mongoIdPathVariableValidator } from "../validators/mongodb.validators.js";
import { validate } from "../validators/body.validators.js";
import { validateDownloadFlag, validateFileType, validateVoiceFlag } from "../validators/file.validators.js";

const router = Router();

router.use(verifyJWT);

router
  .route("/:voice/:download/:attachmentName")
  .get(
    validateVoiceFlag("voice"),
    validateDownloadFlag("download"),
    validate,
    getFile
  )


router
  .route("/:fileType/:chatId")
  .post(
    mongoIdPathVariableValidator("chatId"),
    validateFileType("fileType"),
    validate,
    uploadFile,
    sendFailedToSendOnError
  );


router
  .route("/deleteFile/:chatId/:messageId")
  .delete(
    mongoIdPathVariableValidator("chatId"),
    mongoIdPathVariableValidator("messageId"),
    validate,
    deleteFile
  );

export default router;
