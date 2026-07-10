import moment from "moment";
import { checkChatAvailabilityForUser, getChatInfoWithoutProfiles, getFile, refreshAccessToken } from "../api";
import { MessageTypes } from "../constants";
import { idb } from "../indexedDB";
import store from "../store/store";
import { removePossiblyInaccurateRevisionFromCurrentChat, updateCurrentChat, updateFieldsInCurrentChat } from "../store/currentChatSlice";
import { removePossiblyInaccurateRevisionFromChat, updateChat, updateFieldsInChat } from "../store/chatsSlice";
import { progressUpdater } from "../api/progressUpdater";
import { updateMessageField } from "../store/messagesSlice";

const pendingRequests = {
  status: false,
  list: []
}

const isBrowser = typeof window !== "undefined";

class RetryRequestManager {
  constructor() {
    if (RetryRequestManager._instance) {
      return RetryRequestManager._instance;
    }

    this.requestsToRetry = [];
    this.retryRequestInterval
    RetryRequestManager._instance = this;
  }

  add(request) {
    this.requestsToRetry.push(request);
    if (this.requestsToRetry.length && !this.retryRequestInterval) {
      this.retryRequestInterval = setInterval(this.executeAndDeleteRequests.bind(this), 1000);
    }
  }

  executeAndDeleteRequests() {

    let count = this.requestsToRetry.length;
    while (count > 0 && this.requestsToRetry.length) {
      this.requestsToRetry[0]();
      this.requestsToRetry.splice(0, 1);
      count--;
    }

    if (!this.requestsToRetry.length) {
      clearInterval(this.retryRequestInterval);
      this.retryRequestInterval = null;
    }
  }

}

const retryRequest = new RetryRequestManager();

// for login and register only, where no token is required
const initialRequestHandler = async (api, setLoading, onSuccess, onError, retriesCount) => {
  setLoading && setLoading(true);
  let onResult;

  try {
    const response = await api();
    const { data } = response;

    if (data?.success && onSuccess) {
      onResult = onSuccess(data);
    }
  } catch (error) {
    if (error?.code === "ERR_NETWORK" && (!retriesCount || retriesCount < 11)) {
      // add the request to a retry list
      retryRequest.add(() => initialRequestHandler(api, setLoading, onSuccess, onError, ((retriesCount || 0) + 1)));
      return;
    }
    if ([401, 403].includes(error?.response?.data?.statusCode)) {
      localStorage.clear();

      if (isBrowser) window.location.href = "/login"
    }
    console.log("error occured: ", error);

    if (onError) {
      onResult = onError(error?.response?.data?.message || "Something went wrong");
    }
  } finally {
    if (!onResult?.restrictUndoSetLoading) {
      setLoading && setLoading(false);
    }
  }
}

// for requests that require authorization/authentication
const requestHandler = async (api, setLoading, onSuccess, onError, retriesCount, controllerSignal = undefined) => {
  setLoading && setLoading(true);
  let onResult;

  let response;
  try {
    response = await api(controllerSignal);

  } catch (error) {
    // if it is connection error
    if (error?.code === "ERR_CANCELED") {
      return;
    }

    if (error?.code === "ERR_NETWORK" && (!retriesCount || retriesCount < 10)) {
      // add the request to a retry list
      retryRequest.add(() => requestHandler(api, setLoading, onSuccess, onError, ((retriesCount || 0) + 1)));
      return;
    }

    // if the access token has expired
    if ([401].includes(error?.response?.data?.statusCode)) {
      // all the requests following the first request after getting 401 due to invalid/missing token need to be put in a list for execution later
      if (pendingRequests.status) {
        // this would mean that a refreshAccessToken has already been sent
        pendingRequests.list.push(async () => await requestHandler(api, setLoading, onSuccess, onError));
        return;
      }
      try {
        // if the status is false, turn it to true and request refreshAccessToken
        pendingRequests.status = true;
        await refreshAccessToken();
        response = await api(controllerSignal);

      } catch (error) {
        if ([401, 403].includes(error?.response?.data?.statusCode)) {
          console.log("the retry to refreshtoken failed: ")
          localStorage.clear();
          if (isBrowser) window.location.href = "/login"
        }
        console.log("error occured: ", error);

        if (onError) {
          onResult = onError(error?.response?.data?.message || "Something went wrong");
        }

        if (!onResult?.restrictUndoSetLoading) {
          setLoading && setLoading(false);
        }

        return
      }
    } else {
      if ([401, 403].includes(error?.response?.data?.statusCode)) {
        localStorage.clear();
        if (isBrowser) window.location.href = "/login"
      }
      console.log("error occured: ", error);

      if (onError) {
        onResult = onError(error?.response?.data?.message || "Something went wrong");
      }

      if (!onResult?.restrictUndoSetLoading) {
        setLoading && setLoading(false);
      }
      return
    }
  }

  const { data } = response;

  // if no errors are caught, run the onSuccess callback and loop through pendingRequests.list to execute them
  if (data?.success) {
    if (onSuccess) {
      onResult = onSuccess(data);
    }

    if (pendingRequests.status) {
      pendingRequests.list.forEach(async pr => {
        await pr();
      });
      pendingRequests.status = false;
      pendingRequests.list = [];
    }

    if (!onResult?.restrictUndoSetLoading) {
      setLoading && setLoading(false);
    }
  }
}

const refreshTokenAndConnectSocket = async socket => {
  if (pendingRequests.status) {
    // if it has status push the pending request
    pendingRequests.list.push(async () => {
      await socket.disconnect();
      await socket.connect();
    });
    return;
  }

  let refreshResponse;

  try {
    // if the status if false, turn it to true and request refreshAccessToken
    pendingRequests.status = true;
    refreshResponse = await refreshAccessToken();

  } catch (error) {
    if ([401, 403].includes(error?.response?.data?.statusCode)) {
      localStorage.clear();
      if (isBrowser) window.location.href = "/login";
    }
    console.log("error occured: ", error);
    alert("Session timed out, please login again");
    return;
  }

  // if no errors are caught, run the onSuccess callback and loop through pendingRequests.list to execute them
  const { data } = refreshResponse;

  if (data?.success) {
    await socket.disconnect();
    await socket.connect();

    if (pendingRequests.status) {
      pendingRequests.list.forEach(async pr => {
        await pr();
      });
      pendingRequests.status = false;
      pendingRequests.list = [];
    }
  }

}

export class LocalStorage {
  // Get a value from local storage by key
  static get(key) {
    if (!isBrowser) return;
    const value = localStorage.getItem(key);
    if (value) {
      try {
        return JSON.parse(value);
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  // Set a value in local storage by key
  static set(key, value) {
    if (!isBrowser) return;
    localStorage.setItem(key, JSON.stringify(value));
  }

  // Remove a value from local storage by key
  static remove(key) {
    if (!isBrowser) return;
    localStorage.removeItem(key);
  }

  // Clear all items from local storage
  static clear() {
    if (!isBrowser) return;
    localStorage.clear();
  }
}


const timeCounterFormatter = (timeInSeconds) => {
  const minutes = Math.floor(timeInSeconds / 60)
    .toString()
    .padStart(2, '0');
  const remainingSeconds = (timeInSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};


function userInfoTimestampGenerator(timestamp) {
  const now = moment();
  const date = moment(timestamp);

  if (date.isSame(now, "day")) {
    return `at ${moment(timestamp).format('LT')}`;
  } else if (date.isSame(now.subtract(1, "day"), "day")) {
    return `Yesterday at ${moment(timestamp).format('LT')}`;
  } else if (date.isAfter(now.subtract(6, "days"))) {
    return `${date.format('dddd')} at ${moment(timestamp).format('LT')}`;
  } else if (date.isAfter(now.subtract(180, "days"))) {
    return `on ${date.format('ddd, MMM D')}`;
  } else {
    return `on ${moment().format('L')}`;
  }
}


function truncateString(str, num, showExtension) {
  if (!str) return "";
  if (str.length > num) {
    if (showExtension) {
      const extension = str.split(".").pop();
      return str.slice(0, num - extension.length) + "..." + extension;
    }
    return str.slice(0, num) + "...";
  } else {
    return str;
  }
}

const dateDifference = (timestamp) => {
  const now = new Date().getTime();
  const chatTime = new Date(timestamp).getTime();
  const diff = now - chatTime;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return days;
}

function areTimestampsOnSameDay(timestamp1, timestamp2) {

  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

const getChatObjectMetadata = (chat, loggedInUser) => {
  // Determine the content of the last message, if any.
  let lastMessage = chat.lastMessage;
  if (chat.lastMessage?.sender && !chat.lastMessage.sender._id) {
    lastMessage = { ...chat.lastMessage, sender: { _id: lastMessage.sender } }
  }

  // if proper info about the chat is just absent,
  if (chat.isGroupChat === undefined || chat.isGroupChat === null) {
    return {
      ...chat,
      lastMessage
    }
  }


  if (chat?.isGroupChat) {
    // Case: Group chat
    // Return metadata specific to group chats.
    return {
      // will fetch details for new chat 
      _id: chat._id,
      displayPhoto: chat?.displayPhoto ?? "", // group photo serves as displayPhoto
      name: chat?.name ?? "", // Group name serves as the name.
      isDeleted: chat?.isDeleted ?? false, // if the group chat has been deleted
      isGroupChat: true,
      username: "",
      lastMessage,
      unreadCount: chat.unreadCount || 0,
      notAMember: chat?.notAMember,
      revision: chat.revision,
      possiblyInaccurateRevision: chat?.possiblyInaccurateRevision
    };

  } else {
    // Case: Individual chat
    // Identify the participant other than the logged-in user.
    let participant;
    if (!chat.participants[0]?._id) {
      const participantId = chat.participants.find(
        p => p.toString() !== loggedInUser?._id.toString()
      );

      participant = { _id: participantId }
    } else {
      participant = chat.participants.find(
        p => p._id.toString() !== loggedInUser?._id.toString()
      )
    }
    // Return metadata specific to individual chats.

    const oneOnOneChatInfo = {
      _id: chat._id,
      displayPhoto: participant?.avatar, // Participant's avatar URL.
      name: participant?.fullName, // Participant's username serves as the name.
      isDeleted: chat?.isDeleted ?? false,
      isGroupChat: false,
      lastMessage,
      otherParticipantId: participant?._id,
      unreadCount: chat.unreadCount || 0,
      lastUpdated: participant?.lastUpdated,
      revision: chat.revision

    }

    if (chat?.notVerified) {
      oneOnOneChatInfo.notVerified = chat.notVerified;
      oneOnOneChatInfo.createdAt = chat.createdAt;
    }

    return oneOnOneChatInfo;
  }
};

//needs to be deleted from here
const downloadFile = async (messageId) => {
  try {
    const res = await getFile(messageId);
    if (!res || !res.ok) {
      throw new Error("The requested resource does not exist")
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;

    a.download = "downloaded-file";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url)

  } catch (error) {
    alert(`Error occured: ${error.message}`)
  }
}
//needs to be deleted to here

const downloadMediaToView = async (messageId, messageType, attachmentName) => {
  try {
    progressUpdater.updateProgress({ type: 'spinner' }, messageId, 'download');
    const res = await getFile(messageId, attachmentName, messageType);

    if (!res || !res.data) {
      throw new Error("The requested resource does not exist")
    }

    const blob = res.data;
    progressUpdater.updateProgress({ type: 'spinner' }, messageId, 'download');

    if (messageType === MessageTypes.IMAGE || messageType === MessageTypes.VOICE) {
      await idb.setMedia(attachmentName, blob);
    }

    const storedBlob = await idb.getMedia(attachmentName);

    if (storedBlob?.result?.mediaBlob) {
      const url = URL.createObjectURL(storedBlob.result.mediaBlob);
      store.dispatch(updateMessageField({ messageId, blobUrl: url }));
    } else {
      throw new Error("could not store media");
    }

  } catch (error) {
    progressUpdater.updateProgress(null, messageId, 'download');
    alert(`Error occured: ${error.message}`)
  }
}

const loadMediaFromDisk = async (attachmentName) => {
  try {
    const mediaObject = await idb.getMedia(attachmentName);

    if (mediaObject.failed || !mediaObject.blob) {
      return;
    }

    if (!res || !res.ok) {
      throw new Error("The requested resource does not exist")
    }

    const url = window.URL.createObjectURL(mediaObject.blob);
    return url;

  } catch (error) {
    alert(`Error occured: ${error.message}`)
  }
}

const downloadMediaToDevice = async (localImageUrl) => {
  const link = document.createElement("a");
  link.style.display = "none";
  link.href = localImageUrl;

  link.download = "downloaded-file";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// helper to use react router's useNavigate outside react
const history = {
  navigate: null
}


const determineOkToProcess = async (chatId, chatRevision, fullChat) => {
  if (chatRevision) {
    const currentStoreState = store.getState();
    let targetChat;
    if (currentStoreState.currentChat && (currentStoreState.currentChat._id === chatId)) {
      targetChat = currentStoreState.currentChat;
    } else {
      targetChat = currentStoreState.chats.find(c => c._id === chatId);
    }

    if (targetChat?.revision && (chatRevision <= targetChat.revision)) {
      return { okToProcess: false };
    }

    if (fullChat) {
      return { okToProcess: true };
    } else {
      if (!targetChat.revision || (chatRevision > targetChat.revision + 1)) {
        return await fetchAndSetChatForUpdates(chatId, true);
      } else {
        return { okToProcess: true }
      }
    }

  } else {
    return { okToProcess: true }
  }
}


async function fetchAndSetChatForUpdates(chatId, checkCurrentChat) {
  const chatInfoWithoutProfiles = await new Promise(resolve => {
    requestHandler(
      async () => await getChatInfoWithoutProfiles(chatId),
      null,
      res => {
        resolve(res.data);
      },
      () => resolve(null)
    )
  });

  if (!chatInfoWithoutProfiles) {
    alert("Unable to fetch chat info. Please contact customer support");
    return { failed: true, okToProcess: false }
  } else if (!chatInfoWithoutProfiles._id) {
    //this means that the user may no longer be a member, turn notAMember true for chat
    const updatedFields = { possiblyInaccurateRevision: true, notAMember: true }
    store.dispatch(updateFieldsInChat({ updatedFields, chatId }))
    store.dispatch(updateFieldsInCurrentChat({ updatedFields, chatId }))
    const idbResult = await idb.updateFieldsInChat(chatId, updatedFields);
    return { okToProcess: false, ...idbResult }
  }

  const currentStoreState = store.getState();
  let targetChat;

  if (checkCurrentChat && currentStoreState.currentChat._id === chatId) {
    targetChat = currentStoreState.currentChat._id;
  } else {
    targetChat = store.getState().chats.find(c => c._id === chatId);
  }

  if (targetChat?.revision >= chatInfoWithoutProfiles.revision) {
    return { failed: false, okToProcess: false }
  }

  store.dispatch(updateChat(chatInfoWithoutProfiles));
  const chatForCurrentChat = getChatObjectMetadata(chatInfoWithoutProfiles, store.getState().auth.account);
  store.dispatch(updateCurrentChat(chatForCurrentChat));
  return await idb.setChatInfo(chatInfoWithoutProfiles, true);
}


async function checkAndUpdateChatIfNotAMember(chatId) {
  return await new Promise(resolve => {
    requestHandler(
      async () => checkChatAvailabilityForUser(chatId),
      null,
      async res => {
        const currentChatState = store.getState().chats.find(c => c._id === chatId);
        if (!res.data.chatAvailable) {
          if (currentChatState?.possiblyInaccurateRevision) {
            const updatedFields = { notAMember: true }
            store.dispatch(updateFieldsInChat({ chatId, updatedFields }));
            store.dispatch(updateFieldsInCurrentChat({ chatId, updatedFields }));
            const idbResult = await idb.updateFieldsInChat(chatId, updatedFields);
            resolve({ result: idbResult, failed: false });
          } else {
            resolve({ failed: false })
          }

        } else {
          if (!currentChatState.notAMember) {
            store.dispatch(removePossiblyInaccurateRevisionFromChat(chatId));
            store.dispatch(removePossiblyInaccurateRevisionFromCurrentChat(chatId));
            const idbResult = await idb.removePossiblyInaccurateRevision(chatId);
            resolve({ result: idbResult, failed: false });
          } else {
            resolve({ failed: false })
          }
        }
      },
      () => resolve({ failed: true })
    )
  })
}


export {
  initialRequestHandler,
  requestHandler,
  refreshTokenAndConnectSocket,
  timeCounterFormatter,
  dateDifference,
  getChatObjectMetadata,
  downloadFile,
  downloadMediaToView,
  loadMediaFromDisk,
  downloadMediaToDevice,
  userInfoTimestampGenerator,
  truncateString,
  areTimestampsOnSameDay,
  history,
  determineOkToProcess,
  fetchAndSetChatForUpdates,
  checkAndUpdateChatIfNotAMember
}
