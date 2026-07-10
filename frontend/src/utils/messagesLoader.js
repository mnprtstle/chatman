import { idb } from "../indexedDB";
import { addProfiles } from "../store/currentChatSlice";
import { addMessagesAtEnd, addMessagesAtStart, setMessages } from "../store/messagesSlice";
import { resetNeedReload } from "../store/needReloadSlice";
import { unsetBottomPurged, unsetTopPurged } from "../store/purgedStatusSlice";
import store from "../store/store";
import { messageContainerElement, purgeCheckerAndDoer } from "./messagePurger";
import { messageRenderWaiter } from "./messageRenderWaiter";
import { scrollShiftObject } from "./scrollShiftHandler";

const MESSAGE_BATCH_LENGTH = 50;


async function loadMessages(chatId, loadType) {
  const currentState1 = store.getState();

  if ((currentState1.currentChat?._id !== chatId) ||
    (currentState1.needReload && (loadType !== "reload")) ||
    ((loadType === "bottomLoad") && ((currentState1.purgedStatus.chatId !== chatId) || !currentState1.purgedStatus.bottomPurged))) {

    if (loadType === "reload") {
      store.dispatch(resetNeedReload());
    }

    return;
  }

  if (loadType !== "topLoad") {
    messageRenderWaiter.makeMessagesWait(chatId);
  }

  let startGettingAfterTime;
  let startGettingAfterId;

  if (loadType === "topLoad" && currentState1.messages?.length) {
    startGettingAfterTime = currentState1.messages[currentState1.messages.length - 1]?.deviceTime;
    startGettingAfterId = currentState1.messages[currentState1.messages.length - 1]?._id;
  } else if (loadType === "bottomLoad" && currentState1.messages?.length) {
    startGettingAfterTime = currentState1.messages[0]?.deviceTime;
    startGettingAfterId = currentState1.messages[0]?._id;
  } else {
    startGettingAfterTime = null;
    startGettingAfterId = null;
  }

  const idbMessagesResult = await idb.getMessagesForChat(
    chatId,
    MESSAGE_BATCH_LENGTH,
    currentState1.currentChat.userProfilesObject,
    startGettingAfterTime,
    startGettingAfterId,
    (loadType === "bottomLoad")
  );

  const currentState2 = store.getState();

  if ((currentState2.currentChat?._id !== chatId) ||
    (currentState2.needReload && (loadType !== "reload")) ||
    (loadType === "bottomLoad" && ((currentState2.purgedStatus.chatId !== chatId) || !currentState2.purgedStatus.bottomPurged))) {
    messageRenderWaiter.renderWaitingMessages();
    if (loadType === "reload") {
      //reset needReload so that more fetches arent triggered
      store.dispatch(resetNeedReload())
    }
    return;
  }

  if (idbMessagesResult.result) {
    let purgeResult;
    if (loadType !== "reload") {
      purgeResult = purgeCheckerAndDoer(chatId, loadType);
    }

    store.dispatch(addProfiles({ newProfiles: idbMessagesResult.result.newProfiles, chatId }));

    if (loadType === "topLoad") {
      store.dispatch(addMessagesAtEnd(idbMessagesResult.result.messages));

      if (purgeResult?.newScrollTop) {
        scrollShiftObject.setScrollInfoOnBottomPurgeTopAdd(chatId, purgeResult.newScrollTop);
      }

      if (idbMessagesResult.result.messages && idbMessagesResult.result.messages?.length < MESSAGE_BATCH_LENGTH) {
        store.dispatch(unsetTopPurged(chatId));
        return false;
      } else {
        return true;
      }

    } else if (loadType === "bottomLoad") {
      store.dispatch(addMessagesAtStart(idbMessagesResult.result.messages.reverse()));

      if ("overflowAnchor" in messageContainerElement.current.style) {
        messageContainerElement.current.style.overflowAnchor = "none";
      }

      scrollShiftObject.setScrollInfoOnTopPurgeBottomAdd(chatId, purgeResult?.scrollHeightAfterPurge);

      if (idbMessagesResult.result.messages && (idbMessagesResult.result.messages.length < MESSAGE_BATCH_LENGTH)) {

        store.dispatch(unsetBottomPurged(chatId));
        messageRenderWaiter.renderWaitingMessages(chatId);
        return false;


      } else {
        messageRenderWaiter.clearWaitingMessages(chatId);
        return true;
      }

    } else {

      store.dispatch(setMessages(idbMessagesResult.result.messages));
      store.dispatch(resetNeedReload());
      messageRenderWaiter.renderWaitingMessages(chatId);
      return true;
    }

  } else {
    if (loadType === "reload") {
      messageRenderWaiter.renderWaitingMessages(chatId);
    }
  }

}


export { loadMessages }
