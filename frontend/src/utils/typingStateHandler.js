import store from "../store/store";
import { addTypingUser, removeTypingUser } from "../store/typingUsersSlice";

const TYPING_STATE_TIMEOUT = 6000;

class TypingStateHandlerClass {
  constructor() {
    if (TypingStateHandlerClass._instance) {
      return TypingStateHandlerClass._instance;
    }

    this.typingStateHandler = {}
    TypingStateHandlerClass._instance = this;
  }

  addUserToTypingState(userId, chatId) {
    // clear the timeout if exists
    const oldTimer = this.typingStateHandler[chatId]?.get(userId)
    if (oldTimer) {
      clearTimeout(oldTimer);
    }

    const timeout = setTimeout(() => {
      this.removeUserTypingState(userId, chatId);
    }, TYPING_STATE_TIMEOUT);

    //set the timeout for removing typing state
    if (!this.typingStateHandler[chatId]) {
      this.typingStateHandler[chatId] = new Map();
      this.typingStateHandler[chatId].set(userId, timeout);


    } else {
      this.typingStateHandler[chatId].set(userId, timeout);

    }

    // dispatch to redux to set the state
    store.dispatch(addTypingUser({ userId, chatId }));

  }

  removeUserTypingState(userId, chatId) {
    // clear the timeout if there
    const existingTimer = this.typingStateHandler[chatId]?.get(userId);

    if (existingTimer) {
      clearTimeout(existingTimer);
      // delete the key from map
      this.typingStateHandler[chatId].delete(userId)
    }

    // dispatch to redux to update the state
    store.dispatch(removeTypingUser({ userId, chatId }));
  }

}

export const typingStateHandler = new TypingStateHandlerClass();
