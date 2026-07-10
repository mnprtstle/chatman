export const MessageTypes = {
  TEXT: "text",
  IMAGE: "image",
  FILE: "file",
  VOICE: "voice",
  GROUP_CREATED: "groupCreated",
  GROUP_RENAMED: "groupRenamed",
  CHANGED_DP: "changedDp",
  PARTICIPANT_LEFT: "participantLeft",
  PARTICIPANT_ADDED: "participantAdded",
  PARTICIPANT_REMOVED: "participantRemoved",
  DELETED: "deleted",
  DELETE_FOR_ME: "deleteForMe"
};


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


export const UserLoginType = {
  GOOGLE: "GOOGLE",
  GITHUB: "GITHUB",
  FACEBOOK: "FACEBOOK",
  EMAIL_PASSWORD: "EMAIL_PASSWORD",
};

export const MsgAckEnums = {
  SEEN: "SEEN",
  DELIVERED: "DELIVERED",
  SENT: "SENT"
}

export const ChatStatusEnum = {
  UNKNOWN: "unknown",
  ONLINE: "online",
  OFFLINE: "offline"
}


// in milliseconds
export const STOP_TYPING_TIMER_DURATION = 1000;
export const TYPING_EVENT_SPACING_DURATION = 5000;

export const USER_PROFILE_MAX_AGE = 2 * 24 * 60 * 60 * 1000;

export const AvatarSize = {
  LG: "LG",
  SM: "SM"
}
