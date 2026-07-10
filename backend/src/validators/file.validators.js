import { param } from "express-validator";
import { MessageTypes } from "../constants.js";

export const validateFileType = (fileType) => {
  return [
    param(fileType).notEmpty().isIn([MessageTypes.FILE, MessageTypes.IMAGE, MessageTypes.VOICE]).withMessage("Invalid fileType")
  ];
};

export const validateDownloadFlag = (downloadFlag) => {
  return [
    param(downloadFlag).notEmpty().isIn(["y", "n"]).withMessage("Invalid download flag")
  ];
};
export const validateVoiceFlag = (voiceFlag) => {
  return [
    param(voiceFlag).notEmpty().isIn(["y", "n"]).withMessage("Invalid voice flag")
  ];
};



