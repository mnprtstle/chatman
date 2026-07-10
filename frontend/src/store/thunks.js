import { checkCredentials, login, updateAvatar } from './authSlice';
import { LocalStorage, history } from "../utils";
import { messageRenderWaiter } from '../utils/messageRenderWaiter';
import { scrollShiftObject } from '../utils/scrollShiftHandler';
import { purgeCheckerAndDoer } from '../utils/messagePurger';
import { addMessage } from './messagesSlice';
import { idb } from '../indexedDB';
import { updateUnreadCountToZeroForChat } from './chatsSlice';
import { updateUnreadCountToZeroForCurrentChat } from './currentChatSlice';


const putLoginInfoInState = (loginData) => async (dispatch, _) => {
  LocalStorage.set("account", loginData?.user);
  dispatch(login(loginData));
};

const updateAvatarOnProfile = (avatarData) => async (dispatch, getState) => {
  dispatch(updateAvatar(avatarData));
  LocalStorage.set("account", getState().auth.account);
};

const checkUserCredentials = () => async (dispatch, _) => {
  const _account = LocalStorage.get("account");

  if (_account?._id) {
    dispatch(checkCredentials(_account));
    history.navigate("/chats");
  }
};

const addMessageToMessageSlice = (message, setNotOpened) => (dispatch, getState) => {
  const currentStoreState = getState();

  if ((currentStoreState.currentChat?._id === message.chat) && !currentStoreState.purgedStatus.bottomPurged) {
    if (messageRenderWaiter.getChatIdForWaitingMessages() === message.chat) {
      messageRenderWaiter.addToWaitingMessages({ ...message, notOpened: (setNotOpened ? 1 : undefined) });
    } else {


      const purgeResult = purgeCheckerAndDoer(message.chat, "newMessage");

      if (purgeResult?.purgeType === "bottomPurge") {
        scrollShiftObject.setScrollInfoOnBottomPurgeTopAdd(message.chat, purgeResult.newScrollTop);
      } else {
        scrollShiftObject.setScrollInfoOnTopPurgeBottomAdd(message.chat, purgeResult?.scrollHeightAfterPurge);
        dispatch(addMessage({ ...message, notOpened: (setNotOpened ? 1 : undefined) }));
      }

    }
  }
}

const zeroUnreadCount = () => (dispatch, getState) => {
  const currentChatState = getState().currentChat;
  if (currentChatState?.unreadCount) {
    dispatch(updateUnreadCountToZeroForChat(currentChatState._id));
    dispatch(updateUnreadCountToZeroForCurrentChat(currentChatState._id));
    idb.updateUnreadCountToZeroForChat(currentChatState._id);
  }
}


export {
  putLoginInfoInState,
  updateAvatarOnProfile,
  checkUserCredentials,
  addMessageToMessageSlice,
  zeroUnreadCount

}

