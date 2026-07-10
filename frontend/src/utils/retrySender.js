import { requestHandler } from ".";
import { msgAckEventApi } from "../api";
import { ChatEventEnum, MsgAckEnums } from "../constants";
import { idb } from "../indexedDB";
import { socketInstance as socket } from "../socket-client";
import { updateLastMessage } from "../store/chatsSlice";
import { updateMessage } from "../store/messagesSlice";
import store from "../store/store";

const FAIL_SENDING_AFTER = 30000

class RetrySendingManager {
  constructor() {
    if (RetrySendingManager._instance) {
      return RetrySendingManager._instance;
    }

    this.retrySet = new Set();
    this.socketReady = false;
    this.retryInterval = null;
    this.ackRetryMap = new Map();
    socket.on("connect", () => {
      this.socketReady = true;
    });

    RetrySendingManager._instance = this;
  }

  startSendingRetries() {
    if (this.socketReady) {
      if (!this.retryInterval) {
        this.setUpRetryInterval();
      }
    } else {
      setTimeout(() => {
        if ((this.retrySet.size > 0) || (this.ackRetryMap.size > 0)) {
          this.startSendingRetries()
        }
      }, 3000);
    }
  }

  async addPendingSendsToRetrySender() {
    const pendingMessages = await idb.getPendingMessages();
    pendingMessages.result?.forEach(pm => this.retrySet.add(pm._id));
    const pendingMessagesForAcks = await idb.getPendingMessagesInfoForAck();
    pendingMessagesForAcks.result?.forEach(pm => this.ackRetryMap.set(pm.messageId, pm.sendAckTo));
    if ((this.retrySet.size > 0) || (this.ackRetryMap.size > 0)) {
      this.startSendingRetries();
    }
  }

  addToSet(messageId) {
    this.retrySet.add(messageId);
    this.startSendingRetries();
  }

  async addAckToSet(messageInfo) {
    this.ackRetryMap.set(messageInfo.messageId, messageInfo.sendAckTo);
    await idb.addPendingMessageInfoForAck(messageInfo);
    this.startSendingRetries();
  }

  removeFromSet(messageId) {
    this.retrySet.delete(messageId);
    this.clearRetryIntervalIfEligible();
  }

  async removeAckFromSet(messageId) {
    this.ackRetryMap.delete(messageId);
    await idb.removePendingMessageForAck(messageId);
    this.clearRetryIntervalIfEligible();
  }

  clearRetryIntervalIfEligible() {
    if (this.retryInterval && !this.retrySet.size && !this.ackRetryMap.size) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }

  setUpRetryInterval() {
    this.retryInterval = setInterval(() => {
      this.retrySet.forEach(messageId => {
        this.attemptToSend(messageId)
      }, this);
      this.ackRetryMap.forEach((sendAckTo, messageId) => {
        this.attemptToSend(messageId, sendAckTo)
      }, this);
    }, 5000);
  }

  async attemptToSend(messageId, sendAckTo) {
    const getMessageFromIdb = await idb.getMessageById(messageId);

    if (getMessageFromIdb.failed) return;
    const message = getMessageFromIdb.result;

    if ((Date.now() - message.deviceTime) > FAIL_SENDING_AFTER) {
      if (sendAckTo) {
        this.removeAckFromSet(messageId);
        return;
      }

      await idb.markMessageFailedToSend(messageId);
      store.dispatch(markLastMessageFailedToSend({ messageId, chatId: message.chat }));

      if (store.getState().currentChat?._id === message.chat) {
        store.dispatch(markMessageFailedToSend(messageId));
      }
      this.removeFromSet(messageId);

    } else if ((Date.now() - message.deviceTime) > 5000) {
      if (!sendAckTo) {
        socket.emit(ChatEventEnum.SEND_MESSAGE, {
          content: message.content,
          _id: message._id,
          chat: message.chat,
        });

      } else {
        const eventInfo = {
          senderId: message.sender,
          messageId: message._id,
          ackType: message.notOpened ? MsgAckEnums.DELIVERED : MsgAckEnums.SEEN
        }
        if (sendAckTo === "redis") {
          socket.emit(ChatEventEnum.MSG_ACK_EVENT, eventInfo);
        } else {
          requestHandler(
            async () => await msgAckEventApi(eventInfo),
            null,
            null,
            async () => await this.removeAckFromSet(eventInfo.messageId),
            null,
            4
          );
        }
      }
    }
  }


}

export const retrySender = new RetrySendingManager();
