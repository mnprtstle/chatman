import { createClient } from "redis";
import { ChatEventEnum, DbAttemptStatus } from "./constants.js";
import axios from "axios";

const MAX_RESEND_ATTEMPTS = 3;
const MEMBERS_HASH_TTL = 5 * 60;

async function retryHandler(performFunction, options) {
  return await new Promise(async resolve => {
    let retries = 0;
    const {
      retryAfterConnection = false,
      enforceRetriesAfterConnectionLimit = true,
      retryAfterConnectionDelay = 0,
      maximumRetries = 0,
      retryAfterErrorDelay = 2000,
      failureCallback = () => { }
    } = options;

    const attemptFunction = async () => {

      try {
        if (this.isConnected) {
          const result = await performFunction();
          resolve({
            failed: false,
            result
          })
        } else {
          if (retryAfterConnection) {
            if (!enforceRetriesAfterConnectionLimit || retries < maximumRetries) {
              if (enforceRetriesAfterConnectionLimit) retries++;
              setTimeout(() => attemptFunction(), retryAfterConnectionDelay);
            } else {
              throw new Error("Connection not established");
            }
          } else {
            failureCallback("Connection not established");
            resolve({
              failed: true,
              error: new Error("Connection not established")
            });
          }
        }
      } catch (error) {
        if (retries < maximumRetries) {
          retries++;
          setTimeout(() => attemptFunction(), retryAfterErrorDelay);
        } else {
          failureCallback(error);
          resolve({
            failed: true,
            error
          })
        }
      }

    }

    await attemptFunction();
  });
}



class RedisDbStreamsAdderManager {
  constructor() {
    if (RedisDbStreamsAdderManager._instance) {
      return RedisDbStreamsAdderManager._instance;
    }

    this.isConnected = false;
    this.retries = 0;
    this.client = createClient();
    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("RedisDbStreamsAdder Client Error", e);
      })
      .on('ready', () => {
        this.isConnected = true;
        console.log("RedisDbStreamsAdder Connected");
      })
      .connect();

    RedisDbStreamsAdderManager._instance = this;
  }


  async queueToDb(data) {
    return await retryHandler.call(this, async () => {
      await this.client.xAdd("db:message", "*", JSON.stringify(data));
    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: true,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 2,
      retryAfterErrorDelay: 1000,
      failureCallback: () => {
        console.log("redisDbStreamsAdder queueToDb failed");
      }
    });
  }

}

const redisDbStreamsAdder = new RedisDbStreamsAdderManager();


class RedisRetrySendStreamsReaderManager {
  static instance;
  constructor() {
    this.isConnected = false;
    this.startedWorkingBefore = false;
    this.exitedWhileLoop = false;
    this.confirmedGroupExists = false;
    this.client = createClient();
    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("RedisRetrySendStreamsReader Client Error", e);
        this.confirmedGroupExists = false;
      })
      .on('ready', () => {
        this.isConnected = true;
        this.confirmedGroupExists = false;
        console.log("RedisRetrySendStreamsReader Connected");

        if (this.startedWorkingBefore && this.exitedWhileLoop) {
          this.startWorking();
        }

      })
      .connect();

  }


  async ensureGroupExists() {
    return await retryHandler.call(this, async () => {
      //check if stream exists, if not, create stream and group
      let groupExists = false;
      const streamExists = await this.client.exists('send:message');
      if (streamExists) {
        const groupsArray = await this.client.xInfoGroups('send:message');
        const groupIndex = groupsArray.findIndex(group => group.name === 'send_workers');
        if (groupIndex !== -1) {
          groupExists = true;
        }
      }

      if (!groupExists) {
        await this.client.xGroupCreate(
          'send:message',
          'send_workers',
          '0',
          {
            MKSTREAM: true
          }
        );
      }

      this.confirmedGroupExists = true;
    }, {
      retryAfterConnection: true,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 5,
      retryAfterErrorDelay: 2000,
      failureCallback: (e) => {
        console.log("ensureGroupExists failed: ", e);
      }
    });


  }


  async setMembersOfChat(chatid, chatMembersObject) {
    try {
      await this.client
        .multi()
        .del(`chat:${chatid}:members:v1`)
        .hSet(`chat:${chatid}:members:v1`, chatMembersObject)
        .expire(`chat:${chatid}:members:v1`, MEMBERS_HASH_TTL)
        .exec();

      return {
        failed: false
      }
    } catch (error) {
      console.log("rediscache setMembersOfChat failed: ", error);
      return {
        failed: true
      }
    }

  }


  async lookupChat(chatId) {
    const chatMembersObject = {};

    const response = await axios.get(`${process.env.BACKEND_URL}/api/v1/ws/lookup_chat/${chatId}`, {
      headers: {
        'Authorization': process.env.SOCKET_BACKEND_KEY
      }
    });

    const chatMembers = response.data.data.participants;

    chatMembers.forEach((m, i) => {
      chatMembersObject[m] = i;
    });

    this.setMembersOfChat(chatId, chatMembersObject);


    return { chatMembers, chatMembersObject };

  }

  async performSendingRetry(rawClaimResult) {

    if (!rawClaimResult?.messages?.length) return;
    const streamEntryIdAndType = JSON.parse(Object.values(rawClaimResult?.messages?.[0]?.message).join(""));

    const resultId = rawClaimResult?.messages?.[0]?.id;

    const { entryType, entryId } = streamEntryIdAndType;

    const entryContent = await this.client.hGetAll(`${entryType}_hash:${entryId}`);

    if (entryContent.excludeIds) {
      entryContent.excludeIds = JSON.parse(entryContent.excludeIds);
    }
    if (entryContent.tempReceivingIds) {
      entryContent.tempReceivingIds = JSON.parse(entryContent.tempReceivingIds);
    }

    const ackTrackKey = (entryType === "message") ? `ack_track:${entryId}` : (entryType === "msg_ack") ? `ack_track:msg_ack:${entryId}` : `ack_track:noti:${entryId}`;

    if (!entryContent?._id && !entryContent?.messageId) {
      const pipeline = this.client.multi();
      if (entryContent.tempReceivingIds) {
        pipeline.del([ackTrackKey, `temp:${entryId}:receivers`]);
      } else {
        pipeline.del(ackTrackKey);
      }

      pipeline.xAckDel("send:message", "send_workers", resultId, "ACKED")
        .exec();

      return;
    }


    let numberOfMembers = entryContent.tempReceivingIds ? (
      await this.client.hLen(`temp:${entryId}:receivers`)
    ) : (entryType === "msg_ack") ? (
      1
    ) : (
      (await this.client.multi()
        .hLen(`chat:${entryContent.chat}:members:v${entryContent.chatVersion}`)
        .expire(`chat:${entryContent.chat}:members:v${entryContent.chatVersion}`, MEMBERS_HASH_TTL)
        .exec())[0]
    );

    let alreadyFetchedChatMembersObject;
    if (!numberOfMembers && (entryType !== 'msg_ack') && (!entryContent.tempReceivingIds)) {
      const { chatMembersObject, chatMembers } = await this.lookupChat(entryContent.chat);
      alreadyFetchedChatMembersObject = chatMembersObject;
      numberOfMembers = chatMembers.length;
    }


    const unackedMemberIndices = [];

    let start = 0;


    let noAckTrackExists = false;
    for (let i = 0; i < numberOfMembers; i += start) {
      const end = numberOfMembers - 1;
      const memberIndex = await this.client.bitPos(ackTrackKey, 0, start, end, "BIT");
      if (memberIndex === -1) {
        break;
      }

      if ((memberIndex === 0) && (start !== 0)) {
        // this means that key doesn't exist yet. so there are no acks
        noAckTrackExists = true;
        break;
      }

      unackedMemberIndices.push(memberIndex);
      start = memberIndex + 1;

    }


    if (!unackedMemberIndices.length && !noAckTrackExists) {
      await this.processRedisEntriesOnAllAcked({ entryContent, ackTrackKey, entryType, entryId, resultId });

      return;
    }

    const unackedMemberIds = [];

    let receiversHash;

    if (entryType === "msg_ack") {
      unackedMemberIds.push(entryContent.senderId);
    } else {
      receiversHash = alreadyFetchedChatMembersObject ? (
        alreadyFetchedChatMembersObject
      ) : (entryContent.tempReceivingIds || entryType === "msg_ack") ? (
        await this.client.hGetAll(`temp:${entryId}:receivers`)
      ) : (
        (await this.client.multi()
          .hGetAll(`chat:${entryContent.chat}:members:v${entryContent.chatVersion}`)
          .expire(`chat:${entryContent.chat}:members:v${entryContent.chatVersion}`, MEMBERS_HASH_TTL)
          .exec())[0]
      );


      if (noAckTrackExists) {
        Object.keys(receiversHash)?.forEach(receiverId => {

          if (entryContent.sender && (receiverId === entryContent.sender)) return;
          if (entryContent.excludeIds?.includes(receiverId)) return;
          unackedMemberIds.push(receiverId);
        });

      } else {
        unackedMemberIndices.forEach(userIndex => {
          Object.keys(receiversHash)?.forEach(receiverId => {
            if (parseInt(receiversHash[receiverId]) === userIndex) {
              if (entryContent.sender && (receiverId === entryContent.sender)) return;
              if (entryContent.excludeIds?.includes(receiverId)) return;
              unackedMemberIds.push(receiverId);
            }
          });
        });
      }
    }


    if (!unackedMemberIds.length) {
      await this.processRedisEntriesOnAllAcked({ entryContent, ackTrackKey, entryType, entryId, resultId });

      return;
    }

    const xPendingResult = await this.client.xPendingRange('send:message', 'send_workers', resultId, resultId, 1);
    const deliveriesCount = xPendingResult[0].deliveriesCounter;


    if (deliveriesCount > (MAX_RESEND_ATTEMPTS + 1)) {
      const queueToDbResult = await redisDbStreamsAdder.queueToDb({ entryType, entryId, receivingIds: unackedMemberIds, dbAttemptNumber: "forthDbAttempt" });

      if (queueToDbResult.failed && (entryType === "message")) {

        await this.client.multi()
          .xDelEx("send:message", resultId, "DELREF")
          .del(ackTrackKey)
          .exec();


        throw new Error('failed to queue message to db');
      }


      const pipeline = this.client.multi();
      pipeline
        .hSet(`${entryType}_hash:${entryId}`, "forthDbAttempt", DbAttemptStatus.IN_PROGRESS)
        .xDelEx("send:message", resultId, "DELREF")
        .del(ackTrackKey)


      if (entryContent.tempReceivingIds) {
        pipeline.del(`temp:${entryId}:receivers`);
      }

      pipeline.exec();

      return;

    } else {

      const onlineUsers = [];
      const offlineUsers = [];

      for (const member of unackedMemberIds) {
        const checkOnline = await this.client.zScore("users:presence", member);
        if (!checkOnline) {
          offlineUsers.push(member);
        } else if (Date.now() > checkOnline + (25 * 1000)) {
          offlineUsers.push(member);
        } else {
          onlineUsers.push(member);
        }
      }


      const { firstDbAttempt, secondDbAttempt, thirdDbAttempt, forthDbAttempt, chatVersion, ...contentToSend } = entryContent;

      const pubSubMessageToSend = {
        type: (entryType === "message") ? ChatEventEnum.SEND_MESSAGE : (entryType === "msg_ack") ? ChatEventEnum.MSG_ACK_EVENT : contentToSend.notificationType,
        messageToSend: (entryType === "message") ? { ...contentToSend, createdAt: Number(contentToSend.createdAt) } : (entryType === "msg_ack") ? contentToSend : JSON.parse(contentToSend.messageToSend)
      }

      const pipeline = this.client.multi();

      const stringifiedPubSubMessageToSend = JSON.stringify(pubSubMessageToSend);
      onlineUsers?.forEach(userId => {
        pipeline.publish(userId.toString(), stringifiedPubSubMessageToSend);
      });

      await pipeline.execAsPipeline();

      let dbAttemptNumber = "firstDbAttempt";
      if (deliveriesCount === 3) {
        dbAttemptNumber = "secondDbAttempt";
      } else if (deliveriesCount > 3) {
        dbAttemptNumber = "thirdDbAttempt";
      }

      if (offlineUsers.length) {
        const queueToDbResult = await redisDbStreamsAdder.queueToDb({ entryType, entryId, receivingIds: offlineUsers, dbAttemptNumber });

        if (queueToDbResult.failed && entryType === "message") {
          throw new Error('failed to queue message to db');
        }
      }

      const bitFieldOperations = [];

      const membersToAck = offlineUsers;

      if (entryContent.sender) {
        membersToAck.push(entryContent.sender);
      }
      if (entryContent.excludeIds) {
        membersToAck.push(...entryContent.excludeIds);
      }


      if (entryType !== "msg_ack") {
        membersToAck.forEach(async (userId) => {
          const bitmapIndex = receiversHash[userId];
          bitFieldOperations.push({
            operation: 'SET',
            encoding: 'u1',
            offset: `#${bitmapIndex}`,
            value: 1
          });
        });

      } else {
        if (membersToAck.length) {
          bitFieldOperations.push({
            operation: 'SET',
            encoding: 'u1',
            offset: "#0",
            value: 1
          })
        }
      }


      await this.client.multi()
        .hSet(`${entryType}_hash:${entryId}`, dbAttemptNumber, DbAttemptStatus.IN_PROGRESS)
        .bitField(ackTrackKey, bitFieldOperations)
        .exec();

    }

  }


  async processRedisEntriesOnAllAcked({ entryContent, ackTrackKey, entryType, entryId, resultId }) {
    if (!Object.values(entryContent).includes(DbAttemptStatus.IN_PROGRESS)) {
      if (entryContent.tempReceivingIds) {
        await this.client.multi()
          .del([ackTrackKey, `${entryType}_hash:${entryId}`, `temp:${entryId}:receivers`])
          .xAckDel("send:message", "send_workers", resultId, "ACKED")
          .exec();
      } else {
        await this.client.multi()
          .del([ackTrackKey, `${entryType}_hash:${entryId}`])
          .xAckDel("send:message", "send_workers", resultId, "ACKED")
          .exec();
      }
    } else {
      if (entryContent.tempReceivingIds) {
        await this.client.multi()
          .del([ackTrackKey, `temp:${entryId}:receivers`])
          .xAckDel("send:message", "send_workers", resultId)
          .exec();
      } else {
        await this.client.multi()
          .del(ackTrackKey)
          .xAckDel("send:message", "send_workers", resultId)
          .exec();
      }
    }
  }


  async startWorking() {
    this.startedWorkingBefore = true;
    while (this.isConnected) {

      try {
        this.exitedWhileLoop = false;

        if (!this.confirmedGroupExists) {
          const groupExistsFunction = await this.ensureGroupExists();

          if (groupExistsFunction.failed) {
            throw new Error("ensureGroupExistsFailed");
          }
        }

        const rawClaimResult = await this.client.xAutoClaim('send:message', 'send_workers', process.env.WORKER_ID, 10000, '0-0', {
          COUNT: 1
        });

        await this.performSendingRetry(rawClaimResult);


        if (rawClaimResult.nextId === "0-0") {
          await new Promise(resolve => {
            setTimeout(resolve, 3000);
          });
        }

      } catch (error) {
        console.log("startWorking error occured: ", error);
      }

    }

    console.log("exitedloop");

    this.exitedWhileLoop = true;

  }


}

const redisRetrySendStreamsReader = new RedisRetrySendStreamsReaderManager();


export {
  redisRetrySendStreamsReader
}
