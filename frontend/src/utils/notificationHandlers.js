import { addLastMessage, declareAChatDeleted, exitMemberFromGroupChat, updateGroupChatPhoto, updateLastMessageDeliveredAndSeenStatus, updateLastMessageSentStatus, makeChatVerified, removeParticipantsInChat, updateChatRevision, updateChat, updateChatName, updateOrTransferChat, updateLastMessageToDeletedInCurrentChat, markLastMessageFailedToSend } from "../store/chatsSlice";
import { exitMemberFromChatIfCurrent, makeCurrentChatVerified, makeCurrentChatDeletedIfMatches, udpateCurrentChatName, udpateCurrentChatPhoto, updateCurrentChat, updateCurrentChatRevision, updateOrTransferCurrentChatIfNeeded } from "../store/currentChatSlice";
import store from "../store/store";
import { idb } from "../indexedDB";
import { retrySender } from "./retrySender";
import { setMessageDeliveredAndSeenStatus, setMessageSentStatus, changeChatIdOfMessagesToVerified, markMessageDeleted, markMessageFailedToSend } from "../store/messagesSlice";
import { ChatEventEnum, MsgAckEnums } from "../constants";
import { typingStateHandler } from "./typingStateHandler";
import { addMessageToMessageSlice } from "../store/thunks";
import { getChatInfoWithoutProfiles } from "../api";
import { getChatObjectMetadata, requestHandler, history } from ".";
import { turnOnNeedReload } from "../store/needReloadSlice";

export const allocateEventCallback = async (eventWithBody) => {
  const { data, dataType } = eventWithBody;
  let result;
  switch (dataType) {
    case ChatEventEnum.SEND_MESSAGE:
      result = await onMessageReceived(data);
      break;

    case ChatEventEnum.NEW_MEMBER_EVENT:
      result = await onNewMember(data);
      break;

    case ChatEventEnum.REMOVE_MEMBER_EVENT:
      result = await onRemovedMember(data);
      break;

    case ChatEventEnum.MEMBER_LEFT_EVENT:
      result = await onRemovedMember(data);
      break;

    case ChatEventEnum.EXIT_MEMBER_EVENT:
      result = await onExitMember(data);
      break;

    case ChatEventEnum.MESSAGE_DELETE_EVENT:
      result = await onMessageDelete(data);
      break;

    case ChatEventEnum.NEW_CHAT_EVENT:
      result = await onNewGroupChat(data);
      break;

    case ChatEventEnum.NEW_IN_CHAT_EVENT:
      result = await onNewInChat(data);
      break;

    case ChatEventEnum.DELETE_CHAT_EVENT:
      result = await onDeleteChat(data);
      break;

    case ChatEventEnum.UPDATE_GROUP_NAME_EVENT:
      result = await onUpdateGroupName(data);
      break;

    case ChatEventEnum.UPDATE_GROUP_PHOTO_EVENT:
      result = await onUpdateGroupPhoto(data);
      break;

    case ChatEventEnum.MSG_ACK_EVENT:
      result = await onMessageAcked(data);
      break;

    case ChatEventEnum.TYPING_EVENT:
      result = await onTypingEvent(data);
      break;

    case ChatEventEnum.STOP_TYPING_EVENT:
      result = await onStopTypingEvent(data);
      break;

    case ChatEventEnum.PROCESSED_MSG_ACK_EVENT:
      result = await onProcessedMsgAckEvent(data);
      break;

    case ChatEventEnum.VERIFIED_1_1_CHAT:
      result = await onVerified1on1Chat(data);
      break;

    case ChatEventEnum.FAILED_MESSAGE:
      result = await onFailedToSend(data);
      break;

    default:
      break;


  }

  return result;
}


const onMessageReceived = async (data) => {
  const message = data;
  let setNotOpened = true;

  if (store.getState().currentChat?._id === message.chat) {
    setNotOpened = false;
  }

  if (message.audioDuration) {
    message.audioDuration = Number(message.audioDuration);
  }

  store.dispatch(addLastMessage({ message, setNotOpened }));
  store.dispatch(addMessageToMessageSlice(message, setNotOpened));
  // this one needs to set the notOpened to true and needs to stay true until the seen event is sent
  return { ...(await idb.addNewMessage(message, { setNotOpened: true })), setNotOpened }
}


const onNewMember = async (data) => {
  const { notifyingMessage, chatId, chatRevision } = data;
  store.dispatch(updateChatRevision({ chatId, chatRevision }))
  store.dispatch(updateCurrentChatRevision({ chatId, chatRevision }))

  store.dispatch(addMessageToMessageSlice(notifyingMessage));
  store.dispatch(addLastMessage({ message: notifyingMessage }));
  const idbResult = await Promise.all([
    idb.updateChatRevision(chatId, chatRevision),
    idb.addNewMessage(notifyingMessage)
  ])
  return { failed: idbResult[0].failed || idbResult[1].failed }
}


const onRemovedMember = async (data) => {
  const { chatRevision, chatId, notifyingMessage, removedParticipantIds } = data;
  store.dispatch(removeParticipantsInChat({ removedParticipantIds, chatId, chatRevision }));
  store.dispatch(addMessageToMessageSlice(notifyingMessage));
  store.dispatch(addLastMessage({ message: notifyingMessage }));
  const idbResult = await Promise.all([
    idb.removeParticipantsInChat(removedParticipantIds, chatId, chatRevision),
    idb.addNewMessage(notifyingMessage)
  ]);
  return { failed: idbResult[0].failed || idbResult[1].failed }
}

const onExitMember = async (data) => {
  const { chatId, chatRevision, notifyingMessage: _ } = data;
  store.dispatch(exitMemberFromGroupChat({ chatId, chatRevision }));
  store.dispatch(exitMemberFromChatIfCurrent({ chatId, chatRevision }));
  return await idb.exitMemberFromGroupChat(chatId, chatRevision);
}

//no need
const onMessageDelete = async (data) => {
  //specifically undefined as the last message otherwise is set to null
  const { deletedMessageId, deletedMessageChat } = data;
  const deleteMessageResult = await idb.deleteMessageForEveryone(data);

  if (!deleteMessageResult.failed && deleteMessageResult.validMessageToDelete) {
    store.dispatch(markMessageDeleted({ messageId: deletedMessageId, chatId: deletedMessageChat }));
    store.dispatch(updateLastMessageToDeletedInCurrentChat({ messageId: deletedMessageId, chatId: deletedMessageChat }));
  }

  return deleteMessageResult;
}


const onNewGroupChat = async (data) => {
  const { chat, notifyingMessage } = data;
  store.dispatch(updateChat(chat));
  store.dispatch(addLastMessage({ message: notifyingMessage }));
  store.dispatch(addMessageToMessageSlice(notifyingMessage));
  const idbResult = await Promise.all([
    idb.updateChat(chat),
    idb.addNewMessage(notifyingMessage)
  ]);
  return { failed: idbResult[0].failed || idbResult[1].failed }
}


const onNewInChat = async (data) => {
  const { chat } = data;
  store.dispatch(updateChat(chat));
  const objectForCurrentChat = getChatObjectMetadata(chat, store.getState().auth.account);
  store.dispatch(updateCurrentChat(objectForCurrentChat));
  return await idb.updateChat(chat);
}

const onDeleteChat = async (data) => {
  const { chatRevision, chatId, notifyingMessage: _ } = data;
  store.dispatch(declareAChatDeleted({ chatId, chatRevision }));
  store.dispatch(makeCurrentChatDeletedIfMatches({ chatId, chatRevision }));
  return idb.declareAChatDeleted(chatId, chatRevision);
}


const onUpdateGroupName = async (data) => {
  const { newName, chatRevision, chatId, notifyingMessage } = data;
  store.dispatch(updateChatName({ chatId, chatRevision, updatedName: newName }));
  store.dispatch(udpateCurrentChatName({ chatId, chatRevision, updatedName: newName }));
  store.dispatch(addLastMessage({ message: notifyingMessage }));
  store.dispatch(addMessageToMessageSlice(notifyingMessage));
  const idbResult = await Promise.all([
    idb.updateChatName(chatId, newName, chatRevision),
    idb.addNewMessage(notifyingMessage)
  ]);
  return { failed: idbResult[0].failed || idbResult[1].failed }
}


const onUpdateGroupPhoto = async (data) => {
  const { newPhoto, notifyingMessage, chatRevision, chatId } = data;
  store.dispatch(updateGroupChatPhoto({ updatedDisplayPhoto: newPhoto, chatRevision, chatId }));
  store.dispatch(udpateCurrentChatPhoto({ updatedDisplayPhoto: newPhoto, chatRevision, chatId }));
  store.dispatch(addMessageToMessageSlice(notifyingMessage));
  store.dispatch(addLastMessage({ message: notifyingMessage }));
  const idbResult = await Promise.all([
    idb.updateChatDisplayPhoto(chatId, newPhoto, chatRevision),
    idb.addNewMessage(notifyingMessage)
  ]);
  return { failed: idbResult[0].failed || idbResult[1].failed }
}


const onMessageAcked = async (data) => {
  if (data.ackType === MsgAckEnums.SENT) {
    return await onMessageSent(data);
  } else if (data.ackType === MsgAckEnums.DELIVERED) {
    return await onMessageDelivered(data);
  } else {
    return await onMessageSeen(data);
  }
}


const onMessageSent = async (data) => {
  const { messageId, intendedParticipantCount, sequenceIdAssigned } = data;
  retrySender.removeFromSet(messageId);
  const result = await idb.updateMessageStatusToSent(messageId, intendedParticipantCount, sequenceIdAssigned);
  if (!result.failed && result.chatId) {
    const currentStoreState = store.getState();

    store.dispatch(updateLastMessageSentStatus({ messageId, chatId: result.chatId, intendedParticipantCount: result.updatedIntendedParticipantCount, sequenceIdAssigned }));

    if ((currentStoreState.currentChat?._id === result.chatId) && !currentStoreState.purgedStatus.bottomPurged) {
      store.dispatch(setMessageSentStatus({ messageId, intendedParticipantCount: result.updatedIntendedParticipantCount, sequenceIdAssigned }));
    }
  }

}


const onMessageDelivered = async (data) => {
  const { messageId, receiverId, timeOfAck: time } = data;
  const result = await idb.updateDeliveredOrSeenStatus(messageId, receiverId, time, "delivered");
  if (!result.failed && result.chatId) {
    store.dispatch(updateLastMessageDeliveredAndSeenStatus({ messageId, chatId: result.chatId, updatedDeliveredStatusCount: result.deliveredStatusCount, updatedSeenStatusCount: result.seenStatusCount }));

    const currentStoreState = store.getState();
    if (currentStoreState.currentChat?._id === result.chatId) {
      store.dispatch(setMessageDeliveredAndSeenStatus({ messageId, updatedDeliveredStatusCount: result.deliveredStatusCount, updatedSeenStatusCount: result.seenStatusCount }));
    }
  }

}

const onMessageSeen = async (data) => {
  const { messageId, receiverId, timeOfAck: time } = data;
  const result = await idb.updateDeliveredOrSeenStatus(messageId, receiverId, time, "seen");

  if (!result.failed && result.chatId) {
    store.dispatch(updateLastMessageDeliveredAndSeenStatus({ messageId, chatId: result.chatId, updatedDeliveredStatusCount: result.deliveredStatusCount, updatedSeenStatusCount: result.seenStatusCount }));

    const currentStoreState = store.getState();
    if (currentStoreState.currentChat?._id === result.chatId) {
      store.dispatch(setMessageDeliveredAndSeenStatus({ messageId, updatedDeliveredStatusCount: result.deliveredStatusCount, updatedSeenStatusCount: result.seenStatusCount }));
    }
  }
}


const onTypingEvent = async (data) => {
  const { userId, chatId } = data;
  typingStateHandler.addUserToTypingState(userId, chatId);
}

const onStopTypingEvent = async (data) => {
  const { userId, chatId } = data;
  typingStateHandler.removeUserTypingState(userId, chatId);
}


const onProcessedMsgAckEvent = async (data) => {
  retrySender.removeAckFromSet(data);
}

const onFailedToSend = async (data) => {
  const { failedMessageId } = data;

  const result = await idb.markMessageFailedToSend(failedMessageId);

  if (!result.failed && result.chatId) {
    store.dispatch(markLastMessageFailedToSend({ messageId: failedMessageId, chatId: result.chatId }));
    if (store.getState().currentChat?._id === result.chatId) {
      store.dispatch(markMessageFailedToSend({ messageId: failedMessageId }));
    }
  }

}

const onVerified1on1Chat = async data => {
  let idbResult;
  const { notifyingMessage: _, chatId: verifiedChatId, oldId, chatRevision } = data;
  if (chatRevision === 1) {

    store.dispatch(makeChatVerified({ verifiedChatId, oldId, chatRevision }));
    if (store.getState().currentChat?._id === oldId) {
      store.dispatch(makeCurrentChatVerified({ verifiedChatId, oldId, chatRevision }));

      store.dispatch(changeChatIdOfMessagesToVerified({ verifiedChatId, oldId }));
    }

    idbResult = await idb.makeChatVerified({ verifiedChatId, oldId, chatRevision });

  } else {

    const fetchResult = await new Promise(resolve => {
      requestHandler(
        async () => await getChatInfoWithoutProfiles(verifiedChatId),
        null,
        async res => {
          resolve(res.data);
        },
        () => resolve(null)
      );
    });

    if (fetchResult) {
      if (oldId === verifiedChatId) {
        store.dispatch(updateChat(fetchResult));
        const objectForCurrentChat = getChatObjectMetadata(fetchResult, store.getState().auth.account);
        store.dispatch(updateCurrentChat(objectForCurrentChat));
        idbResult = await Promise.all([
          idb.updateChat(fetchResult),
          idb.updateChatIdForMessages(fetchResult._id, oldId)
        ]);
      } else {
        store.dispatch(updateOrTransferChat({ newChat: fetchResult, oldId }));
        const objectForCurrentChat = getChatObjectMetadata(fetchResult, store.getState().auth.account);
        store.dispatch(updateOrTransferCurrentChatIfNeeded({ newChat: objectForCurrentChat, oldId }));
        store.dispatch(changeChatIdOfMessagesToVerified({ verifiedChatId, oldId }));

        idbResult = await idb.updateOrTransferChat(fetchResult, oldId);
      }
    }

  }

  if ((verifiedChatId !== oldId) && ([verifiedChatId, oldId].includes(store.getState().currentChat?._id))) {
    history.navigate(`/chats/${verifiedChatId}`);
    store.dispatch(turnOnNeedReload());
  }

  return idbResult;
}



export {
  onMessageReceived,
  onNewMember,
  onRemovedMember,
  onExitMember,
  onMessageDelete,
  onNewGroupChat,
  onNewInChat,
  onDeleteChat,
  onUpdateGroupName,
  onUpdateGroupPhoto,
  onMessageSent,
  onMessageDelivered,
  onMessageSeen,
  onTypingEvent,
  onStopTypingEvent,
  onProcessedMsgAckEvent,
  onFailedToSend
}
