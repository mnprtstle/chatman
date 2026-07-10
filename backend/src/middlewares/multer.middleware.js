import multer from "multer";
import { MAX_PHOTO_SIZE } from "../constants.js";

const storage = multer.memoryStorage();

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_PHOTO_SIZE,
  }
})
