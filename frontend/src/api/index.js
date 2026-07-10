import axios from "axios";
import { MessageTypes } from "../constants";
import { progressUpdater } from "./progressUpdater";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_SERVER_URI,
  withCredentials: true,
  timeout: 120000
});


const registerUser = (data, signal) => {
  return apiClient.post("/users/register", data, { signal });
}

const loginUser = (data, signal) => {
  return apiClient.post("/users/login", data, { signal });
};

const logoutUser = (signal) => {
  return apiClient.post("/users/logout", null, { signal });
};

const refreshAccessToken = (signal) => {
  return apiClient.post("/users/refresh-token", null, signal);
}

const updateUserAvatar = (dps, signal) => {
  const data = new FormData();
  data.append("dpLg", dps[0]);
  data.append("dpSm", dps[1]);
  return apiClient.patch("/users/avatar", data, { signal });
}

const getCurrentUser = (signal) => {
  return apiClient.get("/users/current-user", { signal });
}

const changeCurrentPassword = (data, signal) => {
  return apiClient.post("/users/change-password", data, { signal });
}

const addNewParticipantInGroupChat = (chatId, newMembers, signal) => {
  return apiClient.post(`/chats/group/add-participants/${chatId}`, { participantIds: newMembers }, { signal });
}

const createAGroupChat = (data, signal) => {
  return apiClient.post("/chats/group", data, { signal });
}

const createOrGetAOneOnOneChat = (chatInfo, signal) => {
  return apiClient.post("/chats/create_or_get/", chatInfo, { signal });
}

const deleteGroupChat = (chatId, signal) => {
  return apiClient.delete(`/chats/group/${chatId}`, { signal });
}

const getAllChats = (signal) => {
  return apiClient.get("/chats", { signal });
}

const getChatInfo = (chatId, signal) => {
  return apiClient.get(`/chats/chat/${chatId}`, { signal });
}

const getChatInfoWithoutProfiles = (chatId, signal) => {
  return apiClient.get(`/chats/chat_wo_profiles/${chatId}`, { signal });
}

const getBriefChatInfo = (chatId, signal) => {
  return apiClient.get(`/chats/bchat/${chatId}`, { signal });
}

const leaveGroupChat = (chatId, signal) => {
  return apiClient.delete(`/chats/leave/group/${chatId}`, { signal });
}

const removeParticipantFromGroupChat = (chatId, membersToRemove, signal) => {
  return apiClient.delete(`/chats/group/remove-participants/${chatId}`, { data: { participantIds: membersToRemove } }, { signal });
}

const renameGroupChat = (chatId, data, signal) => {
  return apiClient.patch(`/chats/group/${chatId}`, data, { signal });
}

const searchAvailableUsers = (signal) => {
  return apiClient.get("/chats/users", { signal });
}

const deleteMessage = (messageId, chatId, signal) => {
  return apiClient.delete(`/messages/${chatId}/${messageId}`, { signal });
}

const uploadFile = (payloadToSend, fileBlob, fileType, signal) => {
  const { _id, content, chat, audioDuration } = payloadToSend;
  const data = new FormData();
  data.append("_id", _id);
  if (content) {
    data.append("content", content);
  }
  if (audioDuration) {
    data.append("audioDuration", audioDuration);
  }

  data.append("file", fileBlob);

  return apiClient.post(`/file/${fileType}/${chat}`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round(
        (progressEvent.loaded * 100) / progressEvent.total
      );
      progressUpdater.updateProgress({ type: 'progress', value: percentCompleted }, _id, 'upload');
    },
    signal
  });
}


const deleteFile = (messageId, chatId, messageType, attachmentName, signal) => {
  return apiClient.delete(`/messages/${chatId}/${messageId}`, {
    params: {
      messagetype: messageType,
      attachmentname: attachmentName
    },
    signal
  });
}

const deleteFile2 = (messageId, chatId, messageType, attachmentName, signal) => {
  return apiClient.delete(`/messages/${chatId}/${messageId}/${messageType}/${attachmentName}`, { signal });
}


const downloadFileToDevice = (attachmentName, messageType, filename) => {
  if (!attachmentName) return;
  const voiceFlag = (messageType && (messageType === MessageTypes.VOICE)) ? "y" : "n";

  const urlToUse = `${import.meta.env.VITE_SERVER_URI}/file/${voiceFlag}/y/${attachmentName}`
  // Create an invisible anchor element
  const link = document.createElement('a');
  link.href = urlToUse;

  // The 'download' attribute forces a download instead of navigation
  // You can pass an optional filename here
  link.download = filename || 'downloaded-file.jpg';

  // Append to body, click it, and instantly remove it
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const getFile = async (messageId, attachmentName, messageType, signal) => {
  const voiceFlag = (messageType && (messageType === MessageTypes.VOICE)) ? "y" : "n";
  const urlToUse = `file/${voiceFlag}/n/${attachmentName}`;

  return await apiClient.get(urlToUse, {
    responseType: 'blob', // Crucial for handling binary data in the browser
    onDownloadProgress: (progressEvent) => {
      // This ONLY works if the backend sets the 'Content-Length' header!
      if (progressEvent.total) {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        progressUpdater.updateProgress({ type: 'progress', value: percentCompleted }, messageId, 'download');
      }
    },
    signal
  });
}


const updateChatDisplayPhoto = async (displayPhoto, chatId, signal) => {
  const data = new FormData();
  data.append("dpLg", displayPhoto[0]);
  data.append("dpSm", displayPhoto[1]);
  return apiClient.post(`/chats/group/photo/${chatId}`, data, { signal });
}

const getBloomFilterSeedApi = async (signal) => {
  return apiClient.get("/users/get_bloom_seed", { signal });
}

const appLaunchSyncApi = async (signal) => {
  return apiClient.get("/users/app_launch_sync", { signal });
}

const getParticipantProfile = async (userId, signal) => {
  return apiClient.get(`/chats/get_profile/${userId}`, { signal });
}

const getParticipantAvatar = async (userId, signal) => {
  return apiClient.get(`/chats/get_avatar/${userId}`, { signal });
}

const msgAckEventApi = async (eventInfo, signal) => {
  return apiClient.post("/messages/msg_ack_event", eventInfo, { signal });
}

const ackEventApi = async (eventInfo, signal) => {
  return apiClient.post("/messages/ack_event", eventInfo, { signal });
}

const sendMessageForUnverifiedChat = async (message, signal) => {
  return apiClient.post("/messages/send_message_for_unverified_chat", message, { signal });
}

const checkChatAvailabilityForUser = async (chatId, signal) => {
  return apiClient.get(`/chats/check_chat_availability/${chatId}`, { signal });
}

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  updateUserAvatar,
  getCurrentUser,
  changeCurrentPassword,
  addNewParticipantInGroupChat,
  createAGroupChat,
  createOrGetAOneOnOneChat,
  deleteGroupChat,
  getAllChats,
  getChatInfoWithoutProfiles,
  getBriefChatInfo,
  getChatInfo,
  leaveGroupChat,
  removeParticipantFromGroupChat,
  renameGroupChat,
  searchAvailableUsers,
  deleteMessage,
  uploadFile,
  downloadFileToDevice,
  getFile,
  deleteFile,
  updateChatDisplayPhoto,
  getBloomFilterSeedApi,
  appLaunchSyncApi,
  getParticipantProfile,
  getParticipantAvatar,
  msgAckEventApi,
  ackEventApi,
  sendMessageForUnverifiedChat,
  checkChatAvailabilityForUser
}
