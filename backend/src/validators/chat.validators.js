import { body } from "express-validator";

const createAGroupChatValidator = () => {
  return [
    body("name").trim().notEmpty().withMessage("Group name is required"),
    body("participants")
      .isArray({
        min: 2,
        max: 100,
      })
      .withMessage(
        "Participants must be an array with more than 2 members and less than 100 members"
      ),
  ];
};

const updateGroupChatNameValidator = () => {
  return [body("name").trim().notEmpty().withMessage("Group name is required")];
};

const createOrGetAOneOnOneChatValidator = () => {
  return [
    body("_id").exists().trim().notEmpty().isMongoId().withMessage("Invalid _id"),
    body("otherParticipantId").exists().trim().notEmpty().isMongoId().withMessage("Invalid otherParticipantId")
  ]
}


export { createAGroupChatValidator, updateGroupChatNameValidator, createOrGetAOneOnOneChatValidator };
