export const UserLoginType = {
  GOOGLE: "GOOGLE",
  GITHUB: "GITHUB",
  FACEBOOK: "FACEBOOK",
  EMAIL_PASSWORD: "EMAIL_PASSWORD",
};

export const AvailableSocialLogins = Object.values(UserLoginType);

export const DbAttemptStatus = {
  NOT_INITIALIZED: "NOT_INITALIZED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED"
}

export const USER_TEMPORARY_TOKEN_EXPIRY = 20 * 60 * 1000; // 20 minutes

export const DB_NAME = "chat-app";

export const ChatEventEnum = Object.freeze({
  // ? once user is ready to go
  CONNECTED_EVENT: "CONNECTED_EVENT",
  // ? when user gets disconnected
  DISCONNECT_EVENT: "DISCONNECT_EVENT",
  // ? when participant is gets removed from group
  REMOVE_MEMBER_EVENT: "REMOVE_MEMBER_EVENT",
  // ? when the group is deleted
  DELETE_CHAT_EVENT: "DELETE_CHAT_EVENT",
  // ? when admin updates a group name
  UPDATE_GROUP_NAME_EVENT: "UPDATE_GROUP_NAME_EVENT",
  // ? when admin updates a group photo
  UPDATE_GROUP_PHOTO_EVENT: "UPDATE_GROUP_PHOTO_EVENT",
  // ? when there is new one on one chat, new group chat or user gets added in the group
  NEW_CHAT_EVENT: "NEW_CHAT_EVENT",
  // ? when a new member joins the group
  NEW_MEMBER_EVENT: "NEW_MEMBER_EVENT",
  // ? when a member leaves the group
  MEMBER_LEFT_EVENT: "MEMBER_LEFT_EVENT",
  // ? when new message is sent/received
  SEND_MESSAGE: "SEND_MESSAGE",
  // ? when participant stops typing
  STOP_TYPING_EVENT: "STOP_TYPING_EVENT",
  // ? when participant starts typing
  TYPING_EVENT: "TYPING_EVENT",
  // ? when message is deleted
  MESSAGE_DELETE_EVENT: "MESSAGE_DELETE_EVENT",
  // ? when the socket is disconnecting
  DISCONNECTING_EVENT: "DISCONNECTING_EVENT",
  // ? to send to new added members of the chat
  NEW_IN_CHAT_EVENT: "NEW_IN_CHAT_EVENT",
  // ? to send to the members removed from the chat
  EXIT_MEMBER_EVENT: "EXIT_MEMBER_EVENT",
  // ? to send the member presence data to the client
  OTHER_MEMBER_PRESENCE: "OTHER_MEMBER_PRESENCE",
  // ? to send the heartbeat
  HEARTBEAT: "HEARTBEAT",
  // ? sent for acknowledging message events only
  MSG_ACK_EVENT: "MSG_ACK_EVENT",
  // ? sent for acknowledging all events except typing events, presence events, message events, and message received events
  ACK_EVENT: "ACK_EVENT",
  // ? received when a MSG_ACK_EVENT is processed by the server
  PROCESSED_MSG_ACK_EVENT: "PROCESSED_MSG_ACK_EVENT",
  // ? when the one-on-one chat is verified
  VERIFIED_1_1_CHAT: "VERIFIED_1_1_CHAT",
  // ? when the message gets failed to send, only for messages with files or media
  FAILED_MESSAGE: "FAILED_MESSAGE"
});

export const AvailableChatEvents = Object.values(ChatEventEnum);

export const MessageTypes = {
  TEXT: "text",
  IMAGE: "image",
  FILE: "file",
  VOICE: "voice",
  GROUP_CREATED: "groupCreated",
  GROUP_RENAMED: "groupRenamed",
  PARTICIPANT_LEFT: "participantLeft",
  PARTICIPANT_ADDED: "participantAdded",
  PARTICIPANT_REMOVED: "participantRemoved",
  CHANGED_DP: "changedDp",
  DELETED: "deleted",
  DELETE_FOR_ME: "deleteForMe"
};

export const AvailableMessageTypes = Object.values(MessageTypes);


export const MsgAckEnums = {
  SEEN: "SEEN",
  DELIVERED: "DELIVERED",
  SENT: "SENT"
}

export const AvatarSize = {
  LG: "LG",
  SM: "SM"
}


export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_DP_SIZE = 1 * 1024 * 1024;
export const MAX_PHOTO_SIZE = 1.5 * 1024 * 1024;
export const MAX_VOICE_SIZE = 1 * 1024 * 1024;
export const FILE_QTY_LIMIT = 1;

export const ACCEPTED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",

  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",

  // Audio
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",

  // Documents
  "application/pdf",
  "text/plain",

  // Office
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
