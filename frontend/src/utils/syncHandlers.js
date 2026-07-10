import { requestHandler } from ".";
import { getAllChats } from "../api";
import { ChatEventEnum } from "../constants";
import { idb } from "../indexedDB";
import { retrySender } from "./retrySender";
import { eventProcessor } from "./eventProcessor";
//redux
import { setChats } from "../store/chatsSlice";
import { updateCurrentChatOutOfAllChatsIfNeeded } from "../store/currentChatSlice";
import { turnOnNeedReload } from "../store/needReloadSlice";
import store from "../store/store";


async function messageSyncHandler(redisInbox, dbInbox) {
  for (const message of dbInbox) {
    await eventProcessor({ data: message, dataType: ChatEventEnum.SEND_MESSAGE, useCreatedAtForDeviceTime: true }, true);
  }

  for (const message of redisInbox) {
    await eventProcessor({ data: message, dataType: ChatEventEnum.SEND_MESSAGE, useCreatedAtForDeviceTime: true });
  }

  return;
}


async function notificationSyncHandler(redisNotifications, dbNotifications) {
  const result = {};
  for (const notification of dbNotifications) {
    const eventProcessorResult = await eventProcessor({ data: notification?.messageToSend, dataType: notification?.notificationType, useCreatedAtForDeviceTime: true }, true);

    if (eventProcessorResult?.failed) {
      result.failed = true;
      break;
    }
  }

  for (const notification of redisNotifications) {
    const eventProcessorResult = await eventProcessor({ data: notification?.messageToSend, dataType: notification?.notificationType, useCreatedAtForDeviceTime: true });

    if (eventProcessorResult?.failed) {
      result.failed = true;
      break;
    }
  }


  if (result?.failed) {
    await new Promise((resolve) => {
      requestHandler(
        getAllChats,
        null,

        async res => {
          await setAndLoadChats(res.data);
        },

        () => {
          alert("Something went wrong, cannot load chats, please contact customer support");
          resolve();
        }

      );

    });

  }

}


async function setAndLoadChats(chatsArray) {
  const fetchAndSetChatsResult = await idb.setChats(chatsArray);

  if (fetchAndSetChatsResult.failed) {
    alert("Something went wrong, cannot load chats, please contact customer support");
  }

  const loadAllChats = await idb.loadAllChats();

  if (loadAllChats.failed) {
    alert("Something went wrong, cannot load chats, please contact customer support");
  }

  store.dispatch(setChats(loadAllChats.result));
  store.dispatch(updateCurrentChatOutOfAllChatsIfNeeded(loadAllChats.result));

}

async function syncWithServer(data) {
  const { redisInbox, redisNotifications, inbox, notifications } = data;
  const syncFunctionsPromiseArray = [];

  syncFunctionsPromiseArray.push(messageSyncHandler(redisInbox || [], inbox || []));

  if (data.chats) {
    syncFunctionsPromiseArray.push(setAndLoadChats(data.chats))
  } else {
    syncFunctionsPromiseArray.push(notificationSyncHandler(redisNotifications || [], notifications || []));
  }

  await Promise.all(syncFunctionsPromiseArray);

  if (store.getState().currentChat) {
    store.dispatch(turnOnNeedReload());
  }

  retrySender.addPendingSendsToRetrySender();

}





export {
  syncWithServer
}
