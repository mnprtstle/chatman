import { createClient } from "redis";
import { ChatMessage } from "./models/message.model.js";
import { Notification } from "./models/notification.model.js";
import { ChatEventEnum, DbAttemptStatus } from "./constants.js";


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
            resolve({
              failed: true,
              error: new Error("Connection not established")
            })
          }
        }
      } catch (error) {
        if (retries < maximumRetries) {
          retries++;
          setTimeout(() => attemptFunction(), retryAfterErrorDelay);
        } else {
          failureCallback();
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


class RedisStreamsReaderManager {
  constructor() {
    if (RedisStreamsReaderManager._instance) {
      return RedisStreamsReaderManager._instance;
    }

    this.isConnected = false;
    this.startedWorkingBefore = false;
    this.exitedWhileLoop = false;
    this.confirmedGroupExists = false;
    this.client = createClient();
    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("RedisStreamsReader Client Error", e);
      })
      .on('ready', () => {
        this.isConnected = true;
        this.confirmedGroupExists = false;
        console.log("RedisStreamsReader Connected");

        if (this.startedWorkingBefore && this.exitedWhileLoop) {
          this.startWorking();
        }
      })
      .connect();

    RedisStreamsReaderManager._instance = this;
  }


  async ensureGroupExists() {
    return await retryHandler.call(this, async () => {
      //check if stream exists, if not, create stream and group
      let groupExists = false;
      const streamExists = await this.client.exists('db:message');
      if (streamExists) {
        const groupsArray = await this.client.xInfoGroups('db:message');
        const groupIndex = groupsArray.findIndex(group => group.name === 'db_workers');
        if (groupIndex !== -1) {
          groupExists = true;
        }
      }

      if (!groupExists) {
        await this.client.xGroupCreate(
          'db:message',
          'db_workers',
          '0',
          {
            MKSTREAM: true
          }
        );
      }

      this.confirmedGroupExists = true;
    }, {
      maximumRetries: 5,
      retryAfterErrorDelay: 2000,
      failureCallback: () => {
        console.log("ensureGroupExists failed");
      }
    });


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

        const rawClaimResult = await this.client.xAutoClaim('db:message', 'db_workers', process.env.WORKER_ID, 10000, '0-0', {
          COUNT: 1
        });

        const resultArray = rawClaimResult?.messages;

        for (let i = 0; i < (resultArray?.length || 0); i += 4) {
          const fetchAndProcessMap = resultArray
            .slice(i, 4)
            .map(resultItem => this.fetchAndProcess(resultItem));

          await Promise.all(fetchAndProcessMap);
        }

        if (rawClaimResult.nextId === "0-0") {
          await new Promise(resolve => {
            setTimeout(resolve, 3000);
          });
        }


      } catch (error) {
        console.log("startWorking error occured: ", error);
      }

    }


    this.exitedWhileLoop = true;

  }

  async fetchAndProcess(resultItem) {
    try {

      const result = JSON.parse(Object.values(resultItem?.message).join(""));
      const resultId = resultItem?.id;

      const { entryType, entryId, receivingIds, dbAttemptNumber } = result;

      const entryContent = await this.client.hGetAll(`${entryType}_hash:${entryId}`);

      if (entryContent.excludeIds) {
        entryContent.excludeIds = JSON.parse(entryContent.excludeIds);
      }
      if (entryContent.tempReceivingIds) {
        entryContent.tempReceivingIds = JSON.parse(entryContent.tempReceivingIds);
      }

      const addToDbResult = (entryType === "message") ? (
        await addMessageToDb({ ...entryContent, _id: entryId }, receivingIds)
      ) : (entryType === "msg_ack") ? (
        await addMsgAckToDb({ ...entryContent, _id: entryId }, receivingIds)
      ) : (
        await addNotificationToDb({ ...entryContent, _id: entryId }, receivingIds)
      );

      let deliveriesCount;

      if (addToDbResult.failed) {
        console.log("addToDb failed");
        const xPendingResult = await this.client.xPendingRange('db:message', 'db_workers', resultId, resultId, 1);
        deliveriesCount = xPendingResult[0].deliveriesCounter;
      }

      if (deliveriesCount > 2) {
        if (entryType === "message") {
          console.log("storing the message to db failed");
        }
      }

      if (!addToDbResult.failed || deliveriesCount > 2) {
        let receiversHashKey;

        if (entryType !== "msg_ack") {
          receiversHashKey = entryContent.tempReceivingIds ? `temp:${entryId}:receivers` : `chat:${entryContent.chat}:members:v${entryContent.chatVersion}`;
        }
        const ackTrackKey = (entryType === "message") ? `ack_track:${entryId}` : (entryType === "msg_ack") ? `ack_track:msg_ack:${entryId}` : `ack_track:noti:${entryId}`;

        const entryContentHadDbNotInitialized = entryContent[dbAttemptNumber] === DbAttemptStatus.NOT_INITIALIZED;

        const pipeline = this.client.multi();
        if (entryContentHadDbNotInitialized) {
          pipeline.hGet(`${entryType}_hash:${entryId}`, dbAttemptNumber);
        }

        pipeline.hSet(`${entryType}_hash:${entryId}`, dbAttemptNumber, DbAttemptStatus.COMPLETED);
        pipeline.exists(ackTrackKey);

        if (entryType !== "msg_ack") {
          pipeline.hLen(receiversHashKey);
        }

        if (addToDbResult.failed) {
          pipeline.xDelEx("db:message", resultId, "DELREF");
        } else {
          pipeline.xAckDel("db:message", "db_workers", resultId);
        }

        receivingIds.forEach(receivingId => {
          pipeline.zRem((entryType === "message") ? `inbox:user:${receivingId}` : (entryType === "msg_ack") ? `msg_acks:user:${receivingId}` : `notifications:user:${receivingId}`, entryId);
        });

        const pipelineResult = await pipeline.execAsPipeline();

        let ackTrackExists = (entryContentHadDbNotInitialized) ? pipelineResult[2] : pipelineResult[1];

        let zeroCheck;
        let updatedHash;
        let receiversHash;

        if (entryContentHadDbNotInitialized) {
          const latestDbAttemptStatus = pipelineResult[0];
          if (latestDbAttemptStatus === DbAttemptStatus.NOT_INITIALIZED) {
            if (entryType !== "msg_ack") {
              receiversHash = await this.client.hGetAll(receiversHashKey);
              const bitFieldOperations = [];
              receivingIds.forEach(receivingId => {
                const bitmapIndex = receiversHash[receivingId]
                bitFieldOperations.push({
                  operation: 'SET',
                  encoding: 'u1',
                  offset: `#${bitmapIndex}`,
                  value: 1
                });
              });

              await this.client.bitField(ackTrackKey, bitFieldOperations);
            } else {
              await this.client.setBit(`ack_track:msg_ack:${entryId}`, 0, 1);
            }

            ackTrackExists = true;
          }
        }

        if (ackTrackExists) {
          const receiversCount = entryType === "msg_ack" ? 1 : receiversHash ? Object.values(receiversHash).length : await this.client.hLen(receiversHashKey);
          [updatedHash, zeroCheck] = await this.client.multi()
            .hGetAll(`${entryType}_hash:${entryId}`)
            .bitPos(ackTrackKey, 0, 0, receiversCount - 1, "BIT")
            .execAsPipeline();
        } else {
          updatedHash = await this.client.hGetAll(`${entryType}_hash:${entryId}`);
        }

        if ((zeroCheck === undefined || (zeroCheck === -1)) && !Object.values(updatedHash).includes(DbAttemptStatus.IN_PROGRESS)) {
          await this.client.del(`${entryType}_hash:${entryId}`);
        }

      }

      if (addToDbResult.failed) {
        throw new Error("addToDb failed");
      }

    } catch (error) {
      console.log("fetchAndProcess failed", error);
    }

  }


}

async function addMessageToDb(message, receivingIds) {
  try {
    try {
      const { firstDbAttempt, secondDbAttempt, thirdDbAttempt, forthDbAttempt, chatVersion, ...messageToSend } = message;

      await ChatMessage.create({ ...messageToSend, receivingUsers: receivingIds });

    } catch (error) {
      const messageWithIdExists = await ChatMessage.findById(message._id);

      if (messageWithIdExists) {
        await ChatMessage.findByIdAndUpdate(message._id, {
          $addToSet: { receivingUsers: receivingIds }
        });

      } else {
        console.log("Error occured while creating ChatMessage: ", error);
        throw new Error("could not create ChatMessage")
      }

    }

    return { failed: false }

  } catch (error) {
    console.log("addToDb failed: ", error);
    return { failed: true }
  }

}


async function addMsgAckToDb(entryContent, receivingIds) {
  try {
    try {
      const { firstDbAttempt, secondDbAttempt, thirdDbAttempt, forthDbAttempt, ...msgAckInfo } = entryContent;
      await Notification.create({ _id: msgAckInfo._id, messageToSend: msgAckInfo, notificationType: ChatEventEnum.MSG_ACK_EVENT, receivingUsers: receivingIds });

    } catch (error) {
      const notificationWithIdExists = await Notification.findById(entryContent._id);


      if (notificationWithIdExists) {
        await Notification.findByIdAndUpdate(entryContent._id, {
          $addToSet: { receivingUsers: receivingIds }
        });

      } else {
        console.log("Error occured while creating Notification: ", error);
        throw new Error("Error occured while creating notification");
      }

    }

    return { failed: false }

  } catch (error) {
    console.log("addToDb failed: ", error);
    return { failed: true }

  }
}




async function addNotificationToDb(notification, receivingIds) {
  try {
    try {
      const { _id, messageToSend, notificationType } = notification;

      const parsedMessageToSend = JSON.parse(messageToSend);

      await Notification.create({ _id, messageToSend: parsedMessageToSend, notificationType, createdAt: parsedMessageToSend.notifyingMessage?.createdAt ?? Date.now(), receivingUsers: receivingIds });

    } catch (error) {
      const notificationWithIdExists = await Notification.findById(notification._id);


      if (notificationWithIdExists) {
        await Notification.findByIdAndUpdate(notification._id, {
          $addToSet: { receivingUsers: receivingIds }
        });
      } else {
        console.log("Error occured while creating ChatMessage: ", error);
        throw new Error("could not create ChatMessage")
      }

    }


    return { failed: false }

  } catch (error) {
    console.log("addToDb failed: ", error);
    return { failed: true }
  }

}


export const redisStreamsRetryReader = new RedisStreamsReaderManager();
