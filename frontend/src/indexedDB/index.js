import { ObjectId } from 'bson';
import store from '../store/store';
import { MessageTypes } from '../constants';

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error)
    };
  });
}

function promisifyIterator(iteratingRequest, callback) {
  return new Promise((resolve, reject) => {
    let callbackResult;
    iteratingRequest.onsuccess = async (event) => {
      const cursor = event.target.result;

      if (callback) {
        try {
          callbackResult = await callback(cursor); // calls cursor.continue inside the callback
          if (callbackResult?.done) resolve(); // stop iteration and return if done returned by callback
        } catch (error) {
          reject(error); // if an error caught in callback, reject
        }
      } else {
        resolve(cursor?.value); // if there is no callback function provided return with cursor.value
      }

    };

    iteratingRequest.onerror = () => {
      reject(iteratingRequest.error)
    };
  })
}


function runTransaction(db, objectStores, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(objectStores, mode);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error);
    }

    callback(transaction)
      .catch(error => {
        try {
          transaction.abort();
        } catch (e) {
          // means the transaction was already aborted
          // catch block left empty
        }
        reject(error);
      })
  });
}

function retryHandler(returningFunction, options) {
  return new Promise(resolve => {
    let retries = 0;
    const {
      retryAfterReady = true,
      enforceRetriesAfterReadyLimit = true,
      retryAfterReadyDelay = 1000,
      maximumRetries = 3,
      retryAfterErrorDelay = 1000,
      failureCallback = () => { }
    } = options ?? {};


    const attemptFunction = async () => {
      if (!this.dbReady && !this.initializationInProgress) {
        const loggedInUserId = this.userId ?? store.getState().auth.account?._id;

        if (!loggedInUserId) {
          resolve({ failed: true, error: "User not logged in" });
          return;
        }

        const initializeIdbResult = await this.initializeIdb(loggedInUserId);

        if (initializeIdbResult.failed) {
          alert("Unexpected error occured, please restart the app. If error persists, please contact customer support");
          resolve({ failed: true, error: "Idb initialization failed" });
        }
      }

      if (this.dbReady) {

        try {
          const returningFunctionResult = await returningFunction();
          resolve({
            failed: false,
            result: returningFunctionResult
          })
        } catch (error) {
          if (retries < maximumRetries) {
            retries++;
            setTimeout(() => attemptFunction(), retryAfterErrorDelay);
          } else {
            console.log("retryHandler error: ", error);
            failureCallback();
            resolve({
              failed: true,
              error
            });
          }
        }

      } else {
        if (retryAfterReady && (!enforceRetriesAfterReadyLimit || (retries < maximumRetries))) {
          if (enforceRetriesAfterReadyLimit) retries++;
          setTimeout(() => attemptFunction(), retryAfterReadyDelay);
        } else {
          failureCallback();
          resolve({
            failed: true,
            error: new Error("db not ready")
          });
        }

      }

    }

    attemptFunction();
  });

}


class IndexedDbManager {
  constructor() {
    if (IndexedDbManager._instance) {
      return IndexedDbManager._instance;
    }

    this.upgraded = false;
    this.dbReady = false;
    this.initializationInProgress = false;
    this.userId = null;
    this.request = null;
    this.db = null;
    IndexedDbManager._instance = this;
  }

  async initializeIdb(userId) {
    this.userId = userId;
    this.initializationInProgress = true;

    if (typeof window !== "undefined") {
      this.request = window.indexedDB.open(userId, import.meta.env.VITE_INDEXED_DB_VERSION);
    } else {
      this.request = self.indexedDB.open(userId, import.meta.env.VITE_INDEXED_DB_VERSION);
    }

    return await new Promise(resolve => {
      this.request.onerror = ev => {
        console.log("error occured while accessing indexedDb");
        this.initializationInProgress = false;
        resolve({ failed: true });
      }

      this.request.onupgradeneeded = ev => {
        const db = ev.target.result;
        const transaction = ev.target.transaction;
        if (ev.oldVersion < 1) {
          const chatStore = db.createObjectStore("chats", { keyPath: "_id" });
          chatStore.createIndex("participants", "participants", { multiEntry: true });
          chatStore.createIndex("updatedAt", "updatedAt", { unique: false });

          const messageStore = db.createObjectStore("chatMessages", { keyPath: "_id" });
          messageStore.createIndex("deviceTime", "deviceTime", { unique: false });
          messageStore.createIndex("getAllIndex", ["chat", "deviceTime"], { unique: false });
          messageStore.createIndex("notSent", "notSent", { unique: false });

          db.createObjectStore("media_store", { keyPath: "attachmentName" });

          db.createObjectStore("user_profiles", { keyPath: "_id" });

          db.createObjectStore("bloom_filter_obj", { keyPath: "bloomHashSeed" });

        }

        if (ev.oldVersion < 2) {
          db.createObjectStore("pendingMsgAcks", { keyPath: "messageId" });
        }

        const chatMessagesStore = transaction.objectStore("chatMessages");

        if (chatMessagesStore.indexNames.contains("notOpenedIndex")) {
          chatMessagesStore.deleteIndex("notOpenedIndex");
        }

        chatMessagesStore.createIndex("notOpenedIndex", ["chat", "notOpened", "_id"], { unique: false });


        this.upgraded = true;

      }

      this.request.onsuccess = ev => {
        this.db = ev.target.result;
        this.dbReady = true;
        this.db.onerror = ev => {
          console.error(`Database error: ${ev.target.error?.message}`);
        }

        this.db.onversionchange = () => {
          this.db.close();
          window.location.reload();
        };

        this.initializationInProgress = false;
        resolve({});
      }
    });

  }

  terminateConnection() {
    if (this.db) {
      this.db.close();
    }

    this.upgraded = false;
    this.dbReady = false;
    this.initializationInProgress = false;
    this.userId = null;
    this.request = null;
    this.db = null;
  }


  async loadAllChats() {
    const arrayToReturn = [];
    const result = await retryHandler.call(this, async () => {

      await runTransaction(this.db, ["chats", "chatMessages", "user_profiles"], "readonly",
        async (transaction) => {
          const chatStore = transaction.objectStore("chats");
          const messageStore = transaction.objectStore("chatMessages");
          const profileStore = transaction.objectStore("user_profiles");

          await promisifyIterator(chatStore.index("updatedAt").openCursor(null, "prev"),
            async (cursor) => {

              if (cursor?.value) {
                const elementToAdd = cursor.value;

                if (elementToAdd.participants) {
                  elementToAdd.participants = elementToAdd.participants.map(p => ({ _id: p }))
                }

                if (elementToAdd.isGroupChat === false) {
                  const otherParticipantIndex = elementToAdd.participants?.findIndex(p => p._id !== this.userId);

                  if (otherParticipantIndex !== -1) {
                    const profileRequestResult = await promisify(profileStore.get(elementToAdd.participants[otherParticipantIndex]._id));
                    if (profileRequestResult) {
                      elementToAdd.participants = [profileRequestResult, { _id: this.userId }]
                    }
                  }
                }

                const lowerBound = [elementToAdd._id, 0];
                const upperBound = [elementToAdd._id, Date.now()];
                const keyRange = IDBKeyRange.bound(lowerBound, upperBound);
                const lastMessageRequest = messageStore.index("getAllIndex").openCursor(keyRange, "prev");

                const lastMessageRequestResult = await promisifyIterator(lastMessageRequest);

                if (lastMessageRequestResult) {

                  if (lastMessageRequestResult.sender && lastMessageRequestResult.sender !== this.userId) {
                    const senderProfileResult = await promisify(profileStore.get(lastMessageRequestResult.sender));

                    if (senderProfileResult) {
                      elementToAdd.lastMessage = { ...lastMessageRequestResult, sender: senderProfileResult }
                    } else {
                      elementToAdd.lastMessage = lastMessageRequestResult;
                    }

                  } else if (lastMessageRequestResult.sender) {
                    const { seen, delivered, ...lastMessage } = lastMessageRequestResult;

                    elementToAdd.lastMessage = { seen: { length: (seen ?? []).length }, delivered: { length: (delivered ?? []).length }, ...lastMessage }

                  } else {
                    elementToAdd.lastMessage = lastMessageRequestResult
                  }
                }

                arrayToReturn.push(elementToAdd);

                cursor.continue();

              } else if (cursor) {
                cursor.continue();
              } else {
                return { done: true }
              }
            });
        });

    }, {
      failureCallback: () => {
        console.log("indexedDb loadAllChats failed");
      }
    });


    if (result.failed) {
      return {
        failed: true
      }
    }

    return {
      result: arrayToReturn,
      failed: false
    };

  }


  async getMessagesForChat(
    chatId,
    messageBatchLength,
    alreadyAvailableUserProfilesObject,
    startGettingAfterTime,
    startGettingAfterId,
    getInAscendingOrder
  ) {

    const messages = [];
    const newProfiles = {};
    let startGettingAfterIdPassed = false;

    const retryHandlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chatMessages", "user_profiles", "media_store"], "readonly",
        async (transaction) => {
          const lowerBound = (getInAscendingOrder && startGettingAfterTime) ? ([chatId, startGettingAfterTime]) : ([chatId, 0]);
          const upperBound = (!getInAscendingOrder && startGettingAfterTime) ? ([chatId, startGettingAfterTime]) : ([chatId, Date.now() + 3600000]);
          const keyRange = IDBKeyRange.bound(lowerBound, upperBound);
          const messageOrder = getInAscendingOrder ? "next" : "prev";

          await promisifyIterator(transaction.objectStore("chatMessages").index("getAllIndex").openCursor(keyRange, messageOrder),
            async (cursor) => {

              if (cursor?.value) {
                if (cursor.value._id === startGettingAfterId) {
                  startGettingAfterIdPassed = true;
                  cursor.continue();
                  return;
                }
                if ((cursor.value.messageType === MessageTypes.DELETE_FOR_ME) || (startGettingAfterId && !startGettingAfterIdPassed)) {
                  cursor.continue();
                  return;
                }

                const messageToAdd = cursor.value;
                if (messageToAdd.attachmentName && (messageToAdd.messageType !== MessageTypes.FILE)) {
                  const mediaStoreObject = await promisify(transaction.objectStore("media_store").get(messageToAdd.attachmentName));
                  const mediaBlob = mediaStoreObject?.mediaBlob;
                  if (mediaBlob) {
                    messageToAdd.blobUrl = URL.createObjectURL(mediaBlob);
                  }
                }

                const sender = messageToAdd.sender ? ({ _id: messageToAdd.sender }) : null;

                if (sender) {
                  if (sender._id === this.userId) {
                    const { seen, delivered, ...message } = messageToAdd;
                    messages.push({ ...message, sender, seen: { length: (seen ?? []).length }, delivered: { length: (delivered ?? []).length } });
                  } else {
                    messages.push({ ...messageToAdd, sender });
                  }
                } else {
                  messages.push(messageToAdd);
                }


                if (sender?._id && (sender._id !== this.userId) && !alreadyAvailableUserProfilesObject?.[sender._id]) {
                  const userProfilesResult = promisify(transaction.objectStore("user_profiles").get(sender._id));
                  if (userProfilesResult) {
                    const { _id, ...profileObject } = userProfilesResult;
                    newProfiles[sender._id] = profileObject;
                  }

                }


                if (messages.length < messageBatchLength) {
                  cursor.continue();
                }

              } else if (cursor) {
                cursor.continue();
              } else {
                return { done: true }
              }
            });
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb getMessagesForChat failed");
      }
    });


    return {
      ...retryHandlerResult, result: { messages, newProfiles }
    }

  }


  async getNotOpenedMessagesForChat(chatId, messageBatchLength, startGettingAfterId) {
    const messages = [];

    const retryHandlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chatMessages", "readonly",
        async (transaction) => {
          const lowerLimit = [chatId, 1, startGettingAfterId ?? ""];
          const upperLimit = [chatId, 1, [[]]];
          const keyRange = IDBKeyRange.bound(lowerLimit, upperLimit, true, false);

          await promisifyIterator(transaction.objectStore("chatMessages").index("notOpenedIndex").openCursor(keyRange),
            async (cursor) => {
              if (cursor?.value) {
                if (cursor.value.sender) {
                  messages.push({ messageId: cursor.value._id, senderId: cursor.value.sender });
                }

                if (messages.length < messageBatchLength) {
                  cursor.continue();
                }

              } else if (cursor) {
                cursor.continue();
              } else {
                return { done: true }
              }
            });
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb getNotOpenedMessagesForChat failed");
      }
    });

    return {
      ...retryHandlerResult, result: messages
    }

  }


  async updateMessagesToOpened(messages) {
    return await retryHandler.call(this, async () => {
      return await runTransaction(this.db, "chatMessages", "readwrite",
        async (transaction) => {
          for (const { messageId, senderId: _ } of messages) {
            const message = await promisify(transaction.objectStore("chatMessages").get(messageId));

            if (message && message.notOpened) {
              const { notOpened, ...updatedMessage } = message;

              await promisify(transaction.objectStore("chatMessages").put(updatedMessage));
            }
          }

        });
    }, {
      failureCallback: () => {
        console.log("indexedDb updateMessagesToOpened failed");
      }
    });
  }


  async updateUnreadCountToZeroForChat(chatId) {
    return await retryHandler.call(this, async () => {
      return await runTransaction(this.db, "chats", "readwrite",
        async (transaction) => {
          const chat = await promisify(transaction.objectStore("chats").get(chatId));
          const updatedChat = chat;
          updatedChat.unreadCount = 0;
          await promisify(transaction.objectStore("chats").put(updatedChat));

        });
    }, {
      failureCallback: () => {
        console.log("indexedDb updateUnreadCountToZeroForChat failed");
      }
    });
  }


  async getMessageById(messageId) {
    const messageResult = await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("chatMessages").objectStore("chatMessages").get(messageId));
    }, {
      failureCallback: () => {
        console.log("indexedDb getMessagebyId failed");
      }
    });

    if (messageResult.failed) {
      return messageResult;
    } else {
      return { ...messageResult, result: messageResult.result }
    }
  }


  async getPendingMessages() {
    return await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("chatMessages").objectStore("chatMessages").index("notSent").getAll(1));
    }, {
      failureCallback: () => {
        console.log("indexedDb getPendingMessages failed");
      }
    });
  }


  async getPendingMessagesInfoForAck() {
    return await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("pendingMsgAcks").objectStore("pendingMsgAcks").getAll());
    }, {
      failureCallback: () => {
        console.log("indexedDb getPendingMessages failed");
      }
    });
  }


  async addPendingMessageInfoForAck(messageInfo) {
    return await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("pendingMsgAcks", "readwrite").objectStore("pendingMsgAcks").put(messageInfo));
    }, {
      failureCallback: () => {
        console.log("indexedDb getPendingMessages failed");
      }
    });
  }


  async removePendingMessageForAck(messageId) {
    return await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("pendingMsgAcks", "readwrite").objectStore("pendingMsgAcks").delete(messageId));
    }, {
      failureCallback: () => {
        console.log("indexedDb getPendingMessages failed");
      }
    });
  }


  async createOrGetAOneOnOneChat(otherMember) {
    let chatToReturn;
    const handlerResult = await retryHandler.call(this, async () => {
      return await runTransaction(this.db, "chats", "readwrite",
        async (transaction) => {
          const chatListWithMember = await promisify(transaction.objectStore("chats").index("participants").getAll(otherMember));

          let chatExists;

          if (chatListWithMember.length) {
            for (const chat of chatListWithMember) {
              if (!chat.isGroupChat && !chat.isDeleted) {
                chatExists = chat;
                break;
              }
            }
          }

          if (chatExists) {
            chatToReturn = { result: chatExists, existed: true }

          } else {

            const chatInfo = {
              _id: new ObjectId().toString(),
              isDeleted: false,
              isGroupChat: false,
              participants: [otherMember, this.userId],
              admin: this.userId,
              notVerified: true,
              createdAt: Date.now(),
              unreadCount: 0
            }

            await promisify(transaction.objectStore("chats").add(chatInfo));

            chatToReturn = { result: chatInfo, existed: false }

          }
        });


    }, {
      failureCallback: () => {
        console.log("indexedDb createOrGetAOneOnOneChat failed")
      }
    });

    if (chatToReturn) {
      return chatToReturn
    } else {
      return handlerResult;
    }

  }


  async updateFieldsInChat(chatId, updatedFields) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async (transaction) => {
          const chat = await promisify(transaction.objectStore("chats").get(chatId));
          if (chat) {
            await promisify(transaction.objectStore("chats").put({ ...chat, ...updatedFields }));
          } else {
            await promisify(transaction.objectStore("chats").put({ _id: chatId, ...updatedFields }));
          }
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb updateFieldsInChat failed");
      }
    })
  }


  async removePossiblyInaccurateRevision(chatId) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async (transaction) => {
          const chat = await promisify(transaction.objectStore("chats").get(chatId));
          if (chat) {
            const { possiblyInaccurateRevision, ...chatWithoutPossiblyInaccurateRevision } = chat;
            await promisify(transaction.objectStore("chats").put(chatWithoutPossiblyInaccurateRevision));
          }
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb removePossiblyInaccurateRevision failed");
      }
    })

  }


  async markMessageFailedToSend(messageId) {
    let chatId;
    const retryHandlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chatMessages", "readwrite",
        async (transaction) => {
          const message = await promisify(transaction.objectStore("chatMessages").get(messageId));
          if (message && message.notSent) {
            chatId = message.chat;
            const { notSent, ...messageOjectWithoutNotSent } = message
            const updatedMessage = { ...messageOjectWithoutNotSent, failedToSend: true }
            await promisify(transaction.objectStore("chatMessages").put(updatedMessage));
          }
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb updateMessage failed")
      }
    });

    return { ...retryHandlerResult, chatId }
  }


  async updateMessageStatusToSent(messageId, intendedParticipantCount, sequenceIdAssigned) {
    let chatId;
    let updatedIntendedParticipantCount = intendedParticipantCount && Number(intendedParticipantCount);

    const handlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chatMessages", "chats"], "readwrite",
        async (transaction) => {
          const message = await promisify(transaction.objectStore("chatMessages").get(messageId));
          if (message) {
            chatId = message.chat;

            if (chatId && (!intendedParticipantCount || sequenceIdAssigned)) {
              const chat = await promisify(transaction.objectStore("chats").get(chatId));
              if (!intendedParticipantCount && chat.name && (chat.isGroupChat === false)) {
                updatedIntendedParticipantCount = 1;
              }

              if (sequenceIdAssigned && (sequenceIdAssigned > (chat.lastSequenceId || 0))) {
                const updatedChat = chat;
                updatedChat.lastSequenceId = sequenceIdAssigned;
                await promisify(transaction.objectStore("chats").put(updatedChat));
              }
            }

            const updatedMessage = message;

            if (updatedIntendedParticipantCount) {
              updatedMessage.intendedParticipantCount = updatedIntendedParticipantCount;
            }

            if (sequenceIdAssigned) {
              updatedMessage.sequenceId = sequenceIdAssigned;
            }

            if (updatedMessage.notSent) {
              delete updatedMessage.notSent;
            }
            if (updatedMessage.failedToSend) {
              delete updatedMessage.failedToSend;
            }

            await promisify(transaction.objectStore("chatMessages").put(updatedMessage));
          }
        });

    }, {
      failureCallback: () => {
        console.log("updateFieldInMessage updateMessage failed")
      }
    });

    return { ...handlerResult, chatId, updatedIntendedParticipantCount }
  }


  async updateMessageStatusToSeen(messageId) {
    let chatId;

    const handlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chatMessages", "chats"], "readwrite",
        async (transaction) => {
          const message = await promisify(transaction.objectStore("chatMessages").get(messageId));
          if (message) {
            chatId = message.chat;

            const updatedMessage = message;

            if (updatedMessage.notOpened) {
              delete updatedMessage.notOpened;


              await promisify(transaction.objectStore("chatMessages").put(updatedMessage));
              const chat = await promisify(transaction.objectStore("chats").get(message.chat));

              const updatedChat = chat;
              if (updatedChat.unreadCount && updatedChat.unreadCount > 0) {
                updatedChat.unreadCount--;
                await promisify(transaction.objectStore("chats").put(updatedChat));
              }

            }
          }
        });

    }, {
      failureCallback: () => {
        console.log("updateFieldInMessage updateMessage failed")
      }
    });

    return { ...handlerResult, chatId }
  }


  async updateDeliveredOrSeenStatus(messageId, receiverId, timeInMilliseconds, statusType) {
    let chatId;
    let deliveredStatusCount;
    let seenStatusCount;

    const handlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chatMessages", "readwrite",
        async (transaction) => {
          const message = await promisify(transaction.objectStore("chatMessages").get(messageId));

          if (message) {
            chatId = message.chat;
            const updatedMessage = message;
            if (updatedMessage[`${statusType}`]) {
              if (!updatedMessage[`${statusType}`][receiverId]) {
                updatedMessage[`${statusType}`].length = (updatedMessage[`${statusType}`].length || 0) + 1;
              }
              updatedMessage[`${statusType}`][receiverId] = timeInMilliseconds;
            } else {
              updatedMessage[`${statusType}`] = { [receiverId]: timeInMilliseconds, length: 1 }
            }

            if ((statusType === "seen") && !updatedMessage.delivered?.[receiverId]) {
              if (updatedMessage.delivered) {
                updatedMessage.delivered[receiverId] = timeInMilliseconds;
              } else {
                updatedMessage.delivered = { [receiverId]: timeInMilliseconds }
              }

              updatedMessage.delivered.length = (updatedMessage.delivered.length || 0) + 1;
            }

            if (updatedMessage.notSent) {
              delete updatedMessage.notSent;
            }
            if (updatedMessage.failedToSend) {
              delete updatedMessage.failedToSend;
            }

            deliveredStatusCount = updatedMessage.delivered?.length ?? 0;
            seenStatusCount = updatedMessage.seen?.length ?? 0;

            await promisify(transaction.objectStore("chatMessages").put(updatedMessage));
          }
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb updateDeliveredOrSeenStatus failed")
      }
    });

    return { ...handlerResult, chatId, deliveredStatusCount, seenStatusCount }

  }


  async deleteMessageForEveryone(data) {
    const { deletedMessageId, deletedMessageChat, deletedMessageSender } = data;
    let validMessageToDelete = false;
    const retryHandlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chatMessages", "media_store"], "readwrite",
        async (transaction) => {
          const message = await promisify(transaction.objectStore("chatMessages").get(deletedMessageId));
          if (message && (message.sender === deletedMessageSender) && (message.chat === deletedMessageChat)) {
            const updatedMessage = { ...message, content: "", messageType: MessageTypes.DELETED }
            await promisify(transaction.objectStore("chatMessages").put(updatedMessage));
            if (message.attachmentName) {
              await promisify(transaction.objectStore("media_store").delete(message.attachmentName));
            }
            validMessageToDelete = true;
          } else {
            validMessageToDelete = false;
          }
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb updateMessage failed")
      }
    });

    return { validMessageToDelete, ...retryHandlerResult }
  }


  async addNewMessage(message, options) {
    let valueToReturn;
    let senderProfile;

    const handlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chatMessages", "chats", "user_profiles"], "readwrite",
        async (transaction) => {
          const messageExists = await promisify(transaction.objectStore("chatMessages").get(message._id));
          if (messageExists) {
            valueToReturn = { existed: true }
          } else {
            let messageToStore = message;

            if (options?.setNotOpened) {
              messageToStore.notOpened = 1;
            }

            await promisify(transaction.objectStore("chatMessages").put(messageToStore));

            if (messageToStore.sender && (messageToStore.sender !== this.userId)) {
              const senderProfileResult = await promisify(transaction.objectStore("user_profiles").get(messageToStore.sender));
              if (senderProfileResult) {
                senderProfile = senderProfileResult;
              }
            }

            const chat = await promisify(transaction.objectStore("chats").get(messageToStore.chat));

            const updatesForChat = {};
            if (options?.setNotOpened) {
              updatesForChat.unreadCount = (chat?.unreadCount || 0) + 1;
            }

            updatesForChat.lastSequenceId = (!chat?.lastSequenceId || (chat?.lastSequenceId < messageToStore.sequenceId)) ? messageToStore.sequenceId : chat?.lastSequenceId

            if (!chat?.updatedAt || (chat?.updatedAt < messageToStore.deviceTime)) {
              updatesForChat.updatedAt = messageToStore.deviceTime;
            }

            let updatedChat;

            if (chat) {
              updatedChat = { ...chat, ...updatesForChat }
            } else {
              updatedChat = { _id: messageToStore.chat, ...updatesForChat }
            }

            await promisify(transaction.objectStore("chats").put(updatedChat));
          }
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb addNewMessage failed")
      }
    });

    if (valueToReturn) {
      return { ...handlerResult, ...valueToReturn };
    } else {
      return { ...handlerResult, senderProfile };
    }
  }


  async setChatInfo(chatInfo, noProfiles) {
    return await retryHandler.call(this, async () => {
      const participantProfiles = noProfiles ? null : chatInfo.participants;


      const participantIds = noProfiles ? chatInfo.participants : chatInfo.participants.map(p => p._id);

      await runTransaction(this.db, ["chats", "user_profiles"], "readwrite",
        async transaction => {
          const oldChatObject = await promisify(transaction.objectStore("chats").get(chatInfo._id));
          const newChatObject = oldChatObject ? ({ ...oldChatObject, ...chatInfo, participants: participantIds, updatedAt: oldChatObject.updatedAt ?? chatInfo.updatedAt, lastSequenceId: oldChatObject.lastSequenceId }) : ({ ...chatInfo, participants: participantIds, lastSequenceId: null });
          await promisify(transaction.objectStore("chats").put(newChatObject));

          participantProfiles?.forEach(profile => {
            if (profile?._id === this.userId) return;
            transaction.objectStore("user_profiles").put({ ...profile, lastUpdated: Date.now() });
          });

        });

    }, {
      failureCallback: () => {
        console.log("indexedDb setChatInfo failed")
      }
    });
  }


  async updateChatDisplayPhoto(chatId, updatedPhoto, chatRevision) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async (transaction) => {
          const chatObject = await promisify(transaction.objectStore("chats").get(chatId));
          if (chatObject) {
            await promisify(transaction.objectStore("chats").put({ ...chatObject, displayPhoto: updatedPhoto, revision: chatRevision }));
          }
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb chatInfo failed");
      }
    });

  }


  async setChats(chats) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async (transaction) => {
          const chatStore = transaction.objectStore("chats");

          for (const chat of chats) {
            let elementToAdd = chat;

            const existingChatObject = await promisify(chatStore.get(chat._id));

            if (existingChatObject?.revision > chat.revision) {
              continue;
            }

            if (existingChatObject) {
              elementToAdd = {
                ...chat,
                lastSequenceId: existingChatObject?.lastSequenceId,
                updatedAt: existingChatObject?.updatedAt ?? chat.updatedAt,
                unreadCount: existingChatObject?.unreadCount
              }
            }

            await promisify(chatStore.put(elementToAdd));
          }

        });

    }, {
      maximumRetries: 0,
      failureCallback: () => {
        console.log("indexedDb setChats failed")
      }
    })
  }


  async setUserProfiles(users) {
    return retryHandler.call(this, async () => {
      await runTransaction(this.db, "user_profiles", "readwrite",
        async (transaction) => {
          users.forEach(user => {
            transaction.objectStore("user_profiles").put({ ...user, lastUpdated: user.lastUpdated ?? Date.now() });
          })
        });

    }, {
      failureCallback: () => {
        console.log("indexedDb setUserProfiles failed")
      }
    });
  }


  async getUserProfile(userId) {
    return await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("user_profiles").objectStore("user_profiles").get(userId));
    }, {
      retryAfterReady: false,
      enforceRetriesAfterReadyLimit: false,
      retryAfterReadyDelay: 0,
      maximumRetries: 0,
      retryAfterErrorDelay: 0,
      failureCallback: () => {
        console.log("getUserProfile failed");
      }
    });
  }


  async setMedia(attachmentName, mediaBlob) {
    return await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("media_store", "readwrite").objectStore("media_store").put({ attachmentName, mediaBlob }));
    }, {
      failureCallback: () => {
        console.log("indexedDb setMedia failed")
      }
    });
  }


  async getMedia(attachmentName) {
    return retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("media_store").objectStore("media_store").get(attachmentName));
    }, {
      failureCallback: () => {
        console.log("indexedDb getMedia failed")
      }
    });
  }


  async removeParticipantsInChat(removedParticipantIds, chatId, chatRevision) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chats", "chatMessages"], "readwrite",
        async (transaction) => {
          const chat = await promisify(transaction.objectStore("chats").get(chatId));

          if (chat && chat.participants.length) {
            const updatedMembers = chat.participants?.filter(p => !removedParticipantIds.includes(p));

            const updatedChat = { ...chat, participants: updatedMembers, revision: chatRevision }
            transaction.objectStore("chats").put(updatedChat);
          }
        })
    }, {
      failureCallback: () => {
        console.log("indexedDb removeParticipantsInChat failed");
      }
    });

  }


  async exitMemberFromGroupChat(chatId, chatRevision) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async (transaction) => {
          const chat = await promisify(transaction.objectStore("chats").get(chatId));
          if (chat) {
            const updatedChat = { ...chat, notAMember: true }
            if (chatRevision) {
              updatedChat.revision = chatRevision;
            }
            await promisify(transaction.objectStore("chats").put(updatedChat));
          }
        });

    }, {
      failureCallback: () => {
        console.log("indexedDb exitMemberFromGroupChat failed");
      }
    });

  }


  async addNewChat(chat) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chats", "chatMessages"], "readwrite",
        async transaction => {
          const lowerBound = [chat._id];
          const upperBound = [chat._id, []];
          const keyRange = IDBKeyRange.bound(lowerBound, upperBound);
          const messagesOfChat = await promisify(transaction.objectStore("chatMessages").index("getAllIndex").getAll(keyRange));

          let unreadCount = 0;

          messagesOfChat?.forEach(message => {
            if (message.notOpened) {
              unreadCount++;
            }
          });

          const { lastSequenceId: _, ...chatWithoutLastSequenceId } = chat;
          await promisify(transaction.objectStore("chats").put({ ...chatWithoutLastSequenceId, unreadCount }));
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb addNewChat failed");
      }
    })

  }


  async storeUserProfile(profile) {
    return await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("user_profiles", "readwrite").objectStore("user_profiles").put({ ...profile, lastUpdated: profile.lastUpdated ?? Date.now() }));
    }, {
      failureCallback: () => {
        console.log("indexedDb storeUserProfile failed");
      }
    })
  }


  async storeUserAvatar(data) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chats", "user_profiles"], "readwrite",
        async (transaction) => {
          const profile = await promisify(transaction.objectStore("user_profiles").get(data._id));

          const updatedProfile = { ...profile, avatar: data.avatar, lastUpdated: data.lastUpdated ?? Date.now() }
          await promisify(transaction.objectStore("user_profiles").put(updatedProfile));
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb storeUserAvatar failed");
      }
    });

  }


  async loadReceivedMessageIdsToArrayInDesc(lastDeviceTimeFetched, idbBatchCount, oldestMessageTimeInMs, options) {
    const arrayToReturn = [];
    let lastDeviceTime;
    const fetchDeviceTime = options?.fetchDeviceTime;

    // if it is a worker
    if ((typeof window === "undefined") && !this.userId) {
      // then set the userId provided
      this.userId = options.loggedInUserIdForWorker;
    }

    const handlerResult = await retryHandler.call(this, async () => {

      await runTransaction(this.db, ["chatMessages"], "readonly",
        async transaction => {
          const messageStore = transaction.objectStore("chatMessages")
          const upperBound = lastDeviceTimeFetched ? lastDeviceTimeFetched : (Date.now() + (60 * 60 * 1000));
          const lowerBound = oldestMessageTimeInMs;
          const keyRange = IDBKeyRange.bound(lowerBound, upperBound);
          let iterationCount = 1;

          await promisifyIterator(messageStore.index("deviceTime").openCursor(keyRange, "prev"),
            async cursor => {
              if (iterationCount <= idbBatchCount) {
                if (cursor?.value) {
                  if (fetchDeviceTime) {
                    arrayToReturn.push({ _id: cursor.value._id, deviceTime: cursor.value.deviceTime });
                  } else {
                    arrayToReturn.push(cursor.value._id);
                  }

                  if (iterationCount === idbBatchCount) {
                    lastDeviceTime = cursor.value.deviceTime;
                  }

                  iterationCount++;

                  cursor.continue();
                }
              } else {
                return { done: true }
              }
            })
        })
    }, {
      failureCallback: () => {
        console.log("indexedDb loadReceivedMessageIdsToArrayInDesc failed");
      }
    });

    if (handlerResult.failed) {
      return handlerResult;
    } else {
      return {
        result: arrayToReturn,
        lastDeviceTime,
        failed: false
      }
    }

  }


  async checkMessageIdExists(messageId) {
    const idbResult = await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("chatMessages").objectStore("chatMessages").get(messageId));
    }, {
      failureCallback: () => {
        console.log("indexedDb checkMessageIdExists failed");
      }
    });

    if (idbResult.failed) {
      return idbResult;
    } else {
      if (idbResult.result) {
        return { result: true, failed: false }
      } else {
        return { result: false, failed: false }
      }
    }
  }


  async getBloomFilterObject() {
    return await retryHandler.call(this, async () => {
      return await promisify(this.db.transaction("bloom_filter_obj").objectStore("bloom_filter_obj").getAll());
    }, {
      failureCallback: () => {
        console.log("indexedDb getBloomFilterObject failed");
      }
    })
  }


  async updateBloomFilter(bloomFilterObjectToStoreInDisk) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "bloom_filter_obj", "readwrite",
        async transaction => {
          const bloomFilterStore = transaction.objectStore("bloom_filter_obj");
          await promisify(bloomFilterStore.clear());
          await promisify(bloomFilterStore.put(bloomFilterObjectToStoreInDisk));
        });
    }, {
      failureCallback: () => {
        console.log("indexedDb updateBloomFilter failed");
      }
    });
  }


  async makeChatVerified({ verifiedChatId, oldId, chatRevision }) {
    const retryHandlerResult = await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chats", "chatMessages"], "readwrite",
        async transaction => {
          const chatStore = transaction.objectStore("chats");

          if (verifiedChatId === oldId) {
            const chatObject = await promisify(chatStore.get(verifiedChatId));
            if (chatObject) {
              const { notVerified, ...chatObjectWithoutNotVerified } = chatObject;
              if (!chatObjectWithoutNotVerified.revision) {
                chatObjectWithoutNotVerified.revision = chatRevision;
              }
              await promisify(chatStore.put(chatObjectWithoutNotVerified));
            }

          } else {
            const chatOjectWithNewId = await promisify(chatStore.get(verifiedChatId));
            if (chatOjectWithNewId) {
              await promisify(chatStore.delete(oldId));

            } else {
              const chatObjectWithOldId = await promisify(chatStore.get(oldId));
              if (chatObjectWithOldId) {
                const { notVerified, ...chatObjectWithoutNotVerified } = chatObjectWithOldId;
                chatObjectWithoutNotVerified._id = verifiedChatId;
                if (!chatObjectWithoutNotVerified.revision) {
                  chatObjectWithoutNotVerified.revision = chatRevision;
                }

                await promisify(chatStore.put(chatObjectWithoutNotVerified));
              }
            }
          }

          // no need to do in batches as there are only going to be couple of messages
          const lowerBound = [oldId, 0];
          const upperBound = [oldId, Date.now() + 3600000];
          const keyRange = IDBKeyRange.bound(lowerBound, upperBound);

          const messagesWithOldId = await promisify(transaction.objectStore("chatMessages").index("getAllIndex").getAll(keyRange));

          messagesWithOldId.forEach(m => {
            promisify(transaction.objectStore("chatMessages").put({ ...m, chat: verifiedChatId }));
          });

        });
    }, {
      failureCallback: () => {
        console.log("indexedDb makeChatVerfied failed");
      }
    });

    return retryHandlerResult;
  }


  async updateChatRevision(chatId, chatRevision) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async transaction => {
          const chatStore = transaction.objectStore("chats");
          const chatObject = await promisify(chatStore.get(chatId));
          if (chatObject) {
            await promisify(chatStore.put({ ...chatObject, revision: chatRevision }));
          }
        })
    }, {
      failureCallback: () => {
        console.log("idnexedDb updateChatRevision failed")
      }
    });
  }


  async declareAChatDeleted(chatId, chatRevision) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async transaction => {
          const chatStore = transaction.objectStore("chats");
          const chatObject = await promisify(chatStore.get(chatId));
          const updatedChat = { ...chatObject, isDeleted: true }
          if (chatRevision) {
            updatedChat.revision = chatRevision;
          }
          await promisify(chatStore.put(updatedChat));
        });
    })
  }


  async updateChatName(chatId, updatedName, chatRevision) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async transaction => {
          const chatStore = transaction.objectStore("chats");
          const chatObject = await promisify(chatStore.get(chatId));
          await promisify(chatStore.put({ ...chatObject, name: updatedName, revision: chatRevision }));
        });
    });
  }


  async updateChat(chat) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, "chats", "readwrite",
        async transaction => {
          const chatStore = transaction.objectStore("chats");
          const chatObject = await promisify(chatStore.get(chat._id));
          let newChatObject;
          if (chatObject) {
            if (!chatObject.revision || (chatObject.revision < chat.revision)) {
              newChatObject = { ...chat, updatedAt: chatObject.updatedAt, lastSequenceId: chatObject.lastSequenceId }
              await promisify(chatStore.put(newChatObject));
            }
          } else {
            const { lastSequenceId, ...chatobjectWithoutLastSequenceId } = chat;
            newChatObject = chatobjectWithoutLastSequenceId;
            await promisify(chatStore.put(newChatObject));
          }

        })
    }, {
      failureCallback: () => {
        console.log("indexedDb updateChat failed");
      }
    });
  }


  async updateOrTransferChat(newChat, oldId) {
    return await retryHandler.call(this, async () => {
      await runTransaction(this.db, ["chats", "chatMessages"], "readwrite",
        async transaction => {
          const chatStore = transaction.objectStore("chats");
          const chatObjectWithNewId = await promisify(chatStore.get(newChat._id));

          if (chatObjectWithNewId) {
            const updatedChat = { ...newChat, updatedAt: chatObjectWithNewId.updatedAt, lastSequenceId: chatObjectWithNewId.lastSequenceId }
            await promisify(chatStore.put(updatedChat));
            await promisify(chatStore.delete(oldId));
          } else {
            const chatObjectWithOldId = await promisify(chatStore.get(oldId));
            if (chatObjectWithOldId) {
              const updatedChat = { ...newChat, updatedAt: chatObjectWithOldId.updatedAt, lastSequenceId: chatObjectWithOldId.lastSequenceId }
              await promisify(chatStore.put(updatedChat));
              await promisify(chatStore.delete(oldId));
            } else {
              const { lastSequenceId, ...newChatWithoutLastSequenceId } = newChat;
              await promisify(chatStore.put(newChatWithoutLastSequenceId));
            }
          }

          const lowerBound = [oldId, 0];
          const upperBound = [oldId, Date.now() + 3600000];
          const keyRange = IDBKeyRange.bound(lowerBound, upperBound);

          const messagesWithOldId = await promisify(transaction.objectStore("chatMessages").index("getAllIndex").getAll(keyRange));

          messagesWithOldId.forEach(m => {
            promisify(transaction.objectStore("chatMessages").put({ ...m, chat: newChat._id }));
          });

        })
    }, {
      failureCallback: () => {
        console.log("idnexedDb updateOrTransferChat failed");
      }
    })
  }


  async updateChatIdForMessages(newId, oldId) {
    return retryHandler.call(this, async () => {
      return await runTransaction(this.db, "chatMessages", "readwrite",
        async transaction => {
          const lowerBound = [oldId, 0];
          const upperBound = [oldId, Date.now() + 3600000];
          const keyRange = IDBKeyRange.bound(lowerBound, upperBound);
          const messagesWithOldId = await promisify(transaction.objectStore("chatMessages").index("getAllIndex").getAll(keyRange));

          messagesWithOldId.forEach(m => {
            promisify(transaction.objectStore("chatMessages").put({ ...m, chat: newId }));
          });
        })
    })
  }


}

export const idb = new IndexedDbManager();


