import { checkAndUpdateChatIfNotAMember, requestHandler } from ".";
import { ackEventApi, msgAckEventApi } from "../api";
import { ChatEventEnum, MsgAckEnums } from "../constants";
import { idb } from "../indexedDB";
import { socketInstance as socket } from "../socket-client";
import { addLastMessage } from "../store/chatsSlice";
import store from "../store/store";
import { messageDeduplication } from "./messageDeduplication";
import { allocateEventCallback } from "./notificationHandlers";
import { retrySender } from "./retrySender";
import { fetchAndSetChatForUpdates } from ".";
import { addMessageToMessageSlice } from "../store/thunks"

const TIMEOUT_TO_DISPLAY = 4000;
const MESSAGE_RETRIEVING_BATCH_COUNT = 2;

// to store messages in a buffer that arrive out of sequence (a message that was sent later comes before the message that was sent earlier)
class MessageBufferManager {
  constructor() {
    if (MessageBufferManager._instance) {
      return MessageBufferManager._instance;
    }

    this.chatsWithFrozenAfterTimeoutEventProcessing = new Set();
    this.messagesTimedOutDuringProcessAfterTimeoutFreeze = {}
    this.bufferedMessagesHash = {};
    MessageBufferManager._instance = this;
  }

  add(eventWithBody) {
    const { data, dataType, messageId } = eventWithBody;
    // add the message body and set a timeout for when it has to be displayed because of being too late
    const dataElement = {
      eventWithBody,
      timer: setTimeout(this.processEventAfterTimeout.bind(this, eventWithBody), TIMEOUT_TO_DISPLAY)
    }

    let message;
    if (dataType === ChatEventEnum.SEND_MESSAGE) {
      message = data;
    } else {
      message = data.notifyingMessage;
    }

    // store in bufferedMessages if not there already
    if (this.bufferedMessagesHash[message.chat] && !this.bufferedMessagesHash[message.chat].find(el => el.eventWithBody.messageId === messageId)) {
      this.bufferedMessagesHash[message.chat].push(dataElement);
    } else if (!this.bufferedMessagesHash[message.chat]) {
      this.bufferedMessagesHash[message.chat] = [dataElement];
    }

  }

  remove(dataElement) {
    //clear timeout of all the messages in the chat with the same id
    if (dataElement.timer) {
      clearTimeout(dataElement.timer);
    }
    // and then remove the messages
    const { dataType, data, messageId } = dataElement.eventWithBody;

    let message;
    if (dataType === ChatEventEnum.SEND_MESSAGE) {
      message = data;
    } else {
      message = data.notifyingMessage;
    }

    this.bufferedMessagesHash[message.chat] = this.bufferedMessagesHash[message.chat]?.filter(el => el.eventWithBody.messageId !== messageId);
  }

  addMessageToTimedOutDuringFreeze(message) {
    if (this.messagesTimedOutDuringProcessAfterTimeoutFreeze[message.chat]) {
      this.messagesTimedOutDuringProcessAfterTimeoutFreeze[message.chat].add(message._id);
    } else {
      this.messagesTimedOutDuringProcessAfterTimeoutFreeze[message.chat] = new Set([message._id]);
    }
  }

  checkAndProcessMessagesTimedOutDuringFreezeList(chatId) {
    //need to first delete the message from frozen list 
    this.chatsWithFrozenAfterTimeoutEventProcessing.delete(chatId);
    if (this.messagesTimedOutDuringProcessAfterTimeoutFreeze[chatId]) {
      while (true) {
        const messageId = this.messagesTimedOutDuringProcessAfterTimeoutFreeze[chatId].values().next()?.value;
        if (!messageId) break;
        this.messagesTimedOutDuringProcessAfterTimeoutFreeze[chatId].delete(messageId);
        const dataElement = this.bufferedMessagesHash[chatId]?.find(el => el.eventWithBody.messageId === messageId);
        if (dataElement) {
          this.processEventAfterTimeout(dataElement.eventWithBody);
          //so as to only get one message
          break;
        }
      }
    }

  }

  async processEventAfterTimeout(eventWithBody) {
    const { data, dataType } = eventWithBody;

    let message;

    if (dataType === ChatEventEnum.SEND_MESSAGE) {
      message = data;
    } else {
      message = data.notifyingMessage;
    }

    //check if the afterTimeoutEventProcessing is frozen
    if (this.chatsWithFrozenAfterTimeoutEventProcessing.has(message.chat)) {
      this.addMessageToTimedOutDuringFreeze(message);
      return;
    }

    this.chatsWithFrozenAfterTimeoutEventProcessing.add(message.chat);

    const currentStoreState = store.getState();
    const chatForMessage = currentStoreState.chats.find(chat => chat._id === message.chat);

    const eventsToProcessArray = [];


    if (message.sequenceId > (chatForMessage?.lastSequenceId ?? 0) + 1) {
      // if there could be other messages with lower sequence id than timed out message
      this.bufferedMessagesHash[message.chat]?.forEach(element => {
        const e = element.eventWithBody;
        const m = e.dataType === ChatEventEnum.SEND_MESSAGE ? e.data : e.data.notifyingMessage;

        if (m.sequenceId < message.sequenceId) {
          eventsToProcessArray.push(e);
          this.remove(element);
        }
      });

      eventsToProcessArray.sort((a, b) => {
        const aSeqId = (a.dataType === ChatEventEnum.SEND_MESSAGE) ? a.data.sequenceId : a.data.notifyingMessage.sequenceId;
        const bSeqId = (b.dataType === ChatEventEnum.SEND_MESSAGE) ? b.data.sequenceId : b.data.notifyingMessage.sequenceId;
        return aSeqId - bSeqId;
      });

    }

    eventsToProcessArray.push(eventWithBody);
    this.remove({ eventWithBody });
    await processingEventWaiter.processEventsArray(eventsToProcessArray);

    this.checkAndProcessMessagesTimedOutDuringFreezeList(message.chat)
  }


  async recursionCheckEligibleEventsToProcess(chatId, lastSequenceId) {
    if (!this.bufferedMessagesHash[chatId]) return;

    const eligibleEventElements = [];

    for (const el of this.bufferedMessagesHash[chatId]) {
      const sequenceId = el.eventWithBody.dataType === ChatEventEnum.SEND_MESSAGE ? el.eventWithBody.data.sequenceId : el.eventWithBody.data.notifyingMessage.sequenceId;
      if (sequenceId < lastSequenceId + 2) {
        eligibleEventElements.push(el);
      }
    }

    if (eligibleEventElements.length) {
      let numberOfProcessedEvents = 0;

      // add message to display
      for (const el of eligibleEventElements) {
        this.remove(el);
        const eventWithMessageProcessorResult = await eventWithMessageProcessor({ ...el.eventWithBody, noSequenceCheck: true });

        if (!eventWithMessageProcessorResult.addedToWaiting) {
          numberOfProcessedEvents++;
        }
      }

      if (eligibleEventElements.length === numberOfProcessedEvents) {
        await this.recursionCheckEligibleEventsToProcess(chatId, lastSequenceId + 1);
      }
    }
  }

}

const messageBuffer = new MessageBufferManager();

// to store all the events that are processing and hang on to the duplicate ones until processing is complete to avoid processing them more than once
class ProcessingEventWaitManager {
  constructor() {
    if (ProcessingEventWaitManager._instance) {
      return ProcessingEventWaitManager._instance;
    }

    this.eventsInProcessingState = new Set();
    this.waitingToProcessEvents = [];
    ProcessingEventWaitManager._instance = this;
  }

  checkProcessingState(messageId) {
    return this.eventsInProcessingState.has(messageId);
  }

  addToProcessingEvents(messageId) {
    this.eventsInProcessingState.add(messageId);
  }

  addEventBodyToWaitingEvents(eventWithBody) {
    this.waitingToProcessEvents.push(eventWithBody);
  }

  addEventArrayToWaitingEvents(events) {
    this.waitingToProcessEvents.push({ dataType: "array", data: events });
  }

  deleteFromEventsInProcessingState(messageId) {
    this.eventsInProcessingState.delete(messageId);

  }

  removeEventBodyFromWaitingEvents(messageId) {
    this.eventsInProcessingState.delete(messageId);
    this.waitingToProcessEvents = this.waitingToProcessEvents.filter(eventWithBody => {
      if (eventWithBody.dataType !== "array") {
        return eventWithBody.messageId !== messageId;
      } else {
        return true;
      }
    });

  }

  getEventFromWaitingEventsWithMessageId(messageId) {
    this.eventsInProcessingState.delete(messageId);
    const eventsToProcess = [];
    const eventArraysToProcess = [];

    const newWaitingToProcessEvents = [];
    this.waitingToProcessEvents.forEach(eventWithBody => {
      if (eventWithBody.dataType === "array" && (eventWithBody.data[0]?.messageId === messageId)) {
        eventArraysToProcess.push(eventWithBody.data);
      } else if (eventWithBody.messageId === messageId) {
        eventsToProcess.push(eventWithBody);
      } else {
        newWaitingToProcessEvents.push(eventWithBody)
      }
    });

    this.waitingToProcessEvents = newWaitingToProcessEvents;


    return { eventsToProcess, eventArraysToProcess };
  }

  async processEventsArray(eventsToProcessArray) {
    let eventsToPutInWaitingEvents;

    for (let i = 0; i < eventsToProcessArray.length; i++) {
      const eventWithMessageProcessorResult = await eventWithMessageProcessor({ ...eventsToProcessArray[i], noSequenceCheck: true });

      if (eventWithMessageProcessorResult?.addedToWaiting) {
        eventsToPutInWaitingEvents = eventsToProcessArray.slice(i);
        break;
      }
    }

    if (eventsToPutInWaitingEvents?.length) {
      this.addEventArrayToWaitingEvents(eventsToPutInWaitingEvents);
    }

    // if no messages were sent for waiting, check other elgible messages
    if (!eventsToPutInWaitingEvents?.length) {
      const lastEvent = eventsToProcessArray[eventsToProcessArray.length - 1];
      const lastMessage = lastEvent.dataType === ChatEventEnum.SEND_MESSAGE ? lastEvent.data : lastEvent.data.notifyingMessage;
      await messageBuffer.recursionCheckEligibleEventsToProcess(lastMessage.chat, lastMessage.sequenceId);
    }
  }

}

const processingEventWaiter = new ProcessingEventWaitManager();


async function eventWithMessageProcessor(eventWithBodyArg, isDbPersistedEvent) {
  let allocateEventCallbackResult;
  const { data, dataType } = eventWithBodyArg;
  const messageId = eventWithBodyArg.messageId || ((dataType === ChatEventEnum.SEND_MESSAGE) ? data?._id : data.notifyingMessage?._id);
  // to determine if createdAt will be used for deviceTime field in the message
  const useCreatedAtForDeviceTime = eventWithBodyArg.useCreatedAtForDeviceTime || false;
  // to determine if this messsage needs a sequence check before processing
  const noSequenceCheck = eventWithBodyArg.noSequenceCheck || useCreatedAtForDeviceTime || false;

  const eventWithBody = {
    data,
    dataType,
    messageId,
    useCreatedAtForDeviceTime,
    noSequenceCheck
  }

  if (processingEventWaiter.checkProcessingState(messageId)) {
    processingEventWaiter.addEventBodyToWaitingEvents(eventWithBody);
    return { addedToWaiting: true }
  }

  // add to processignevents so that not other events with same id can be processed simultaneously
  processingEventWaiter.addToProcessingEvents(messageId);

  // check if it is a duplicate
  const duplicateCheck = await messageDeduplication.checkDuplicate(messageId);

  if (duplicateCheck) {
    processingEventWaiter.removeEventBodyFromWaitingEvents(messageId);

  } else {
    const message = (dataType === ChatEventEnum.SEND_MESSAGE) ? data : data.notifyingMessage;
    const currentStoreState = store.getState();
    const chatForMessage = currentStoreState.chats.find(chat => chat._id === message.chat);

    if (noSequenceCheck || (
      message.sequenceId === 1
    ) || (
        chatForMessage && (
          message.sequenceId === 1 || (
            message.sequenceId <= (chatForMessage.lastSequenceId ?? 0) + 1
          )
        )
      )
    ) {

      // this event can be processed, not a duplicate event, chats are not being fetched and another event with same id is not processing
      const okToProcessResult = await determineOkToProcess(dataType, data, chatForMessage?.revision, message.chat, message);

      if (okToProcessResult.okToProcess) {
        const deviceTime = useCreatedAtForDeviceTime ? message.createdAt : Date.now();

        const dataWithUpdatedDeviceTime = (dataType === ChatEventEnum.SEND_MESSAGE) ? ({ ...data, deviceTime }) : ({ ...data, notifyingMessage: { ...data.notifyingMessage, deviceTime } });

        if (chatForMessage?.possiblyInaccurateRevision && dataWithUpdatedDeviceTime?.chat) {
          dataWithUpdatedDeviceTime.chat.possiblyInaccurateRevision = true;
        }

        allocateEventCallbackResult = await allocateEventCallback({ data: dataWithUpdatedDeviceTime, dataType });


        if (chatForMessage?.possiblyInaccurateRevision) {
          const checkAndUpdateChatIfNotAMemberResult = await checkAndUpdateChatIfNotAMember(chatForMessage._id);
          if (checkAndUpdateChatIfNotAMemberResult.failed) {
            allocateEventCallbackResult.failed = true;
          }
        }

      } else {
        allocateEventCallbackResult = okToProcessResult;
      }

      if (!allocateEventCallbackResult?.failed) {
        messageDeduplication.addMessage(messageId);
        processingEventWaiter.deleteFromEventsInProcessingState(messageId);
      }


    } else {
      // add the message to the messageBuffer to wait until the lower sequence id messages arrive so that the messages can be displayed in the order they were sent
      messageBuffer.add(eventWithBody);
      processingEventWaiter.deleteFromEventsInProcessingState(messageId);
      return { addedToBuffer: true }
    }

  }


  if (!allocateEventCallbackResult?.failed) {
    let eventInfo;

    let setNotOpened;
    if (duplicateCheck) {
      if (eventWithBodyArg?.data?.chat && (store.getState().currentChat?._id === eventWithBodyArg.data.chat)) {
        setNotOpened = false;
      } else {
        setNotOpened = true;
      }
    } else {
      setNotOpened = allocateEventCallbackResult?.setNotOpened;
    }

    if (eventWithBodyArg?.dataType === ChatEventEnum.SEND_MESSAGE) {
      eventInfo = {
        senderId: eventWithBodyArg?.data?.sender,
        messageId,
        ackType: (setNotOpened) ? MsgAckEnums.DELIVERED : MsgAckEnums.SEEN
      }
    } else {
      eventInfo = {
        eventId: messageId,
        type: "notificationAck"
      }
    }


    // if the event was from db, ack needs to go to http backend
    if (isDbPersistedEvent) {
      if (eventWithBodyArg?.dataType === ChatEventEnum.SEND_MESSAGE) {
        requestHandler(
          async () => await msgAckEventApi(eventInfo),
          null,
          null,
          async () => await retrySender.removeAckFromSet(eventInfo.messageId),
          null,
          4
        );

        await retrySender.addAckToSet({ messageId: eventInfo.messageId, sendAckTo: "db" });

      } else {
        requestHandler(
          async () => await ackEventApi(eventInfo),
          null,
          null,
          null,
          4
        );
      }

      // otherwise, it goes to socket backend
    } else {
      if ((eventWithBodyArg?.dataType === ChatEventEnum.SEND_MESSAGE)) {
        // for acking messages, retrySender needs to be used
        socket?.emit(ChatEventEnum.MSG_ACK_EVENT, eventInfo);
        await retrySender.addAckToSet({ messageId: eventInfo.messageId, sendAckTo: "redis" });

      } else {
        socket?.emit(ChatEventEnum.ACK_EVENT, eventInfo);
      }
    }

    if (dataType === ChatEventEnum.SEND_MESSAGE && !allocateEventCallbackResult?.setNotOpened && !duplicateCheck) {
      await idb.updateMessageStatusToSeen(eventInfo.messageId);
    }
  }

  return { failed: allocateEventCallbackResult?.failed }

}


async function eventWithoutMessageProcessor(eventWithBodyArg, isDbPersistedEvent) {
  let allocateEventCallbackResult;
  const chatForEvent = eventWithBodyArg.data.chatId ? store.getState().chats.find(chat => chat._id === eventWithBodyArg.data.chatId) : null;
  const okToProcessResult = await determineOkToProcess(eventWithBodyArg.dataType, eventWithBodyArg.data, chatForEvent?.revision, eventWithBodyArg.data.chatId);


  if (okToProcessResult.okToProcess) {
    const eventData = eventWithBodyArg.data;
    if (chatForEvent?.possiblyInaccurateRevision && eventData?.chat) {
      eventData.chat.possiblyInaccurateRevision = true;
    }

    allocateEventCallbackResult = await allocateEventCallback({ data: eventData, dataType: eventWithBodyArg.dataType });

    if (chatForEvent?.possiblyInaccurateRevision) {
      const checkAndUpdateChatIfNotAMemberResult = await checkAndUpdateChatIfNotAMember(chatForEvent._id);
      if (checkAndUpdateChatIfNotAMemberResult.failed) {
        allocateEventCallbackResult.failed = true;
      }
    }

  } else {
    allocateEventCallbackResult = okToProcessResult;
  }

  if (!allocateEventCallbackResult?.failed) {
    // one of these events doesn't need to be acked back to the server
    if ([ChatEventEnum.TYPING_EVENT, ChatEventEnum.STOP_TYPING_EVENT, ChatEventEnum.PROCESSED_MSG_ACK_EVENT].includes(eventWithBodyArg?.dataType)) {
      return { addedToWaiting: false, failed: allocateEventCallbackResult?.failed };
    }

    let eventInfo;

    if (eventWithBodyArg?.dataType === ChatEventEnum.MSG_ACK_EVENT) {
      eventInfo = {
        messageId: eventWithBodyArg?.data.messageId,
        receiverId: eventWithBodyArg?.data.receiverId,
        type: "receivedMessageReceiptAck",
        receiptType: eventWithBodyArg.data.ackType
      }
    } else {
      eventInfo = {
        eventId: eventWithBodyArg?.data?._id ?? eventWithBodyArg.data.notifyingMessage._id,
        type: "notificationAck"
      }
    }

    // if the event was from db, ack needs to go to http backend
    if (isDbPersistedEvent) {
      requestHandler(
        async () => await ackEventApi(eventInfo),
        null,
        null,
        null,
        4
      );

      // otherwise, it goes to socket backend
    } else {
      socket?.emit(ChatEventEnum.ACK_EVENT, eventInfo);
    }

  }

  return { failed: allocateEventCallbackResult?.failed }

}

function objectIsEmpty(obj) {
  for (const _ in obj) return false;
  return true;
}


async function eventProcessor(eventWithBodyArg, isDbPersistedEvent) {
  if (!eventWithBodyArg.data || objectIsEmpty(eventWithBodyArg.data)) return;

  if ((eventWithBodyArg.dataType !== ChatEventEnum.SEND_MESSAGE) && (!eventWithBodyArg.data.notifyingMessage || eventWithBodyArg.data.notifyingMessage?.noNotifyingMessage)) {
    return await eventWithoutMessageProcessor(eventWithBodyArg, isDbPersistedEvent);

  } else {
    const eventWithMessageProcessorResult = await eventWithMessageProcessor(eventWithBodyArg, isDbPersistedEvent);
    if (eventWithMessageProcessorResult?.addedToWaiting || eventWithMessageProcessorResult?.addedToBuffer) {
      return;
    } else {


      setTimeout(async () => {
        const { data, dataType } = eventWithBodyArg;
        const messageId = (dataType === ChatEventEnum.SEND_MESSAGE) ? data._id : data.notifyingMessage._id;
        const { eventsToProcess, eventArraysToProcess } = processingEventWaiter.getEventFromWaitingEventsWithMessageId(messageId);
        for (const e of eventsToProcess) {
          await eventWithMessageProcessor(e);
        }

        for (const a of eventArraysToProcess) {
          await processingEventWaiter.processEventsArray((a))
        }

        if (!eventWithMessageProcessorResult?.failed) {
          const message = (dataType === ChatEventEnum.SEND_MESSAGE) ? data : data.notifyingMessage;
          messageBuffer.recursionCheckEligibleEventsToProcess(message.chat, message.sequenceId);
        }
      }, 0);
    }
  }

}

async function sendMessageSeenAcksIfNeeded(chatId) {
  if (!chatId) return;
  let endOfNotOpenedMessagesForChat = false;
  let startGettingAfterId;

  while (!endOfNotOpenedMessagesForChat) {
    let totalSeenEventsSent = 0;
    const messagesWithNotOpened = await idb.getNotOpenedMessagesForChat(chatId, MESSAGE_RETRIEVING_BATCH_COUNT, startGettingAfterId);

    if (!messagesWithNotOpened.failed) {
      messagesWithNotOpened.result?.forEach(({ messageId, senderId }) => {
        const eventInfo = {
          senderId,
          messageId,
          ackType: MsgAckEnums.SEEN
        }

        socket?.emit(ChatEventEnum.MSG_ACK_EVENT, eventInfo);
        retrySender.addAckToSet({ messageId: eventInfo.messageId, sendAckTo: "redis" });
        totalSeenEventsSent++;
      });

      if (messagesWithNotOpened.result.length) {
        startGettingAfterId = messagesWithNotOpened.result?.[messagesWithNotOpened.result?.length - 1]?.messageId;
        idb.updateMessagesToOpened(messagesWithNotOpened.result);
      }

      endOfNotOpenedMessagesForChat = totalSeenEventsSent < MESSAGE_RETRIEVING_BATCH_COUNT;
    }

  }

}


async function determineOkToProcess(dataType, data, revision, chatId, message) {
  if (dataType === ChatEventEnum.VERIFIED_1_1_CHAT) {
    return { okToProcess: true }
  }

  if (data.chatRevision) {

    if (revision && data.chatRevision <= revision) {
      if (message) {
        const deviceTime = message.createdAt;
        const messageToDispatch = { ...message, deviceTime }
        store.dispatch(addMessageToMessageSlice(messageToDispatch));
        store.dispatch(addLastMessage({ message: messageToDispatch }));
        const idbAddNewMessageResult = await idb.addNewMessage(messageToDispatch);
        return { failed: idbAddNewMessageResult.failed }
      } else {
        return { failed: false };
      }
    }

    if (data.fullChat) {
      return { okToProcess: true };
    } else {
      if (!revision || (data.chatRevision > revision + 1)) {
        const fetchAndSetResult = await fetchAndSetChatForUpdates(chatId)
        if (message) {
          const deviceTime = message.createdAt;
          const messageToDispatch = { ...message, deviceTime }
          store.dispatch(addMessageToMessageSlice(messageToDispatch));
          store.dispatch(addLastMessage({ message: messageToDispatch }));
          const idbAddNewMessageResult = await idb.addNewMessage(messageToDispatch);
          return { failed: idbAddNewMessageResult.failed || fetchAndSetResult.failed }
        } else {
          return fetchAndSetResult;
        }
      } else {
        return { okToProcess: true }
      }
    }
  } else {
    return { okToProcess: true }
  }
}



export {
  eventProcessor,
  sendMessageSeenAcksIfNeeded
}
