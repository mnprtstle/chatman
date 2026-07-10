import { addWaitingMessages } from "../store/messagesSlice";
import store from "../store/store";
import { purgeCheckerAndDoer } from "./messagePurger";

class MessageRenderWaitManager {
  constructor() {
    if (MessageRenderWaitManager._instance) {
      return MessageRenderWaitManager._instance;
    }

    this.chatIdForWaitingMessages = "";
    this.waitingMessages = [];
    MessageRenderWaitManager._instance = this;
  }

  makeMessagesWait(chatId) {
    if (this.chatIdForWaitingMessages !== chatId) {
      this.chatIdForWaitingMessages = chatId;
      this.waitingMessages = [];
    }
  }

  renderWaitingMessages(chatId) {
    if (this.chatIdForWaitingMessages === store.getState().currentChat?._id) {
      if (this.chatIdForWaitingMessages === chatId) {
        purgeCheckerAndDoer(chatId, "newMessage");
        store.dispatch(addWaitingMessages(this.waitingMessages));
      } else {
        return;
      }
    }

    this.waitingMessages = [];
    this.chatIdForWaitingMessages = "";
  }

  clearWaitingMessages(chatId) {
    if (this.chatIdForWaitingMessages === store.getState().currentChat?._id) {
      if (this.chatIdForWaitingMessages !== chatId) {
        return;
      }
    }

    this.waitingMessages = [];
    this.chatIdForWaitingMessages = "";

  }

  getChatIdForWaitingMessages() {
    return this.chatIdForWaitingMessages;
  }

  addToWaitingMessages(message) {
    this.waitingMessages.push(message);
  }
}

export const messageRenderWaiter = new MessageRenderWaitManager();
