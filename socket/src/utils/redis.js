import { createClient, defineScript } from "redis";
import { io } from "./socket.js";
import { DbAttemptStatus } from "../constants.js";
import crypto from "crypto";

const MEMBERS_HASH_TTL = 5 * 60;
const SEQUENCE_ID_MAX_AGE = 5 * 60;

async function retryHandler(performFunction, options) {
  return await new Promise(async resolve => {
    options = options ?? {}

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
            failureCallback();
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

class RedisCacheManager {
  constructor() {
    if (RedisCacheManager._instance) {
      return RedisCacheManager._instance;
    }
    this.isConnected = false;
    this.client = createClient({
      scripts: {
        getAndUpdateSequenceId: defineScript({
          NUMBER_OF_KEYS: 1,
          SCRIPT: `
                        local value = redis.call("get", KEYS[1])
                        if value then
                        local newValue = tonumber(value) + 1
                        redis.call("SETEX", KEYS[1], ${SEQUENCE_ID_MAX_AGE}, newValue)
                        return newValue
                        else 
                        return nil
                        end
                    `,
          FIRST_KEY_INDEX: 1,
          parseCommand(parser, key) {
            parser.pushKey(key)
          },
        }),

        getAndUpdateSequenceId2: defineScript({
          NUMBER_OF_KEYS: 1,

          SCRIPT: `
                    local value = redis.call("get", KEYS[1])
                    if value then
                    local newValue = tonumber(value) + 1
                    redis.call("SETEX", KEYS[1], ${SEQUENCE_ID_MAX_AGE}, newValue)
                    redis.log(redis.LOG_VERBOSE, "found it")
                    redis.log(redis.LOG_VERBOSE, newValue)
                    return newValue
                    else 
                    redis.call("SETEX", KEYS[1], ${SEQUENCE_ID_MAX_AGE}, ARGV[1])
                    redis.log(redis.LOG_VERBOSE, "didnt find")
                    redis.log(redis.LOG_VERBOSE, ARGV[1])
                    return ARGV[1]
                    end
                `,
          FIRST_KEY_INDEX: 1,
          parseCommand(parser, key, arg) {
            parser.pushKey(key);
            parser.push(arg);
          },
        })
      }
    });

    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("Redis Cache Client Error", e);
      })
      .on('ready', () => {
        this.isConnected = true
      })
      .connect();

    RedisCacheManager._instance = this;

  }

  async validateChat(chatId, senderId) {
    try {
      if (this.isConnected) {
        const currentChatVersion = await this.client.getEx(`chat:${chatId}:members:cv`, {
          type: 'EX',
          value: MEMBERS_HASH_TTL
        });

        const cacheResult = await this.client
          .multi()
          .hExists(`chat:${chatId}:members:v${currentChatVersion || 1}`, senderId)
          .hKeys(`chat:${chatId}:members:v${currentChatVersion || 1}`)
          .expire(`chat:${chatId}:members:v${currentChatVersion || 1}`, MEMBERS_HASH_TTL)
          .execAsPipeline();

        return {
          senderIsMember: cacheResult[0],
          chatMembers: cacheResult[1],
          currentChatVersion: Number(currentChatVersion ?? 1)
        }

      } else {
        return {
          senderIsMember: 0,
          chatMembers: []
        }
      }
    } catch (error) {
      console.log("redisCache validateChat failed: ", error);
      return {
        senderIsMember: 0,
        chatMembers: []
      }
    }
  }

  async setMembersOfChat(chatid, chatMembers, chatVersion) {
    try {
      if (this.isConnected) {
        const chatMembersObject = {}
        chatMembers.forEach((member, i) => {
          chatMembersObject[member] = i;
        });

        await this.client
          .multi()
          .del(`chat:${chatid}:members:v1`)
          .hSet(`chat:${chatid}:members:v1`, chatMembersObject)
          .expire(`chat:${chatid}:members:v1`, MEMBERS_HASH_TTL)
          .setEx(`chat:${chatid}:members:cv`, MEMBERS_HASH_TTL, (chatVersion || 1).toString())
          .exec();

        return {
          failed: false
        }
      }
    } catch (error) {
      console.log("rediscache setMembersOfChat failed: ", error);
      return {
        failed: true
      }
    }

  }

  async updateUserPresence(userId) {
    const lastSeenTime = Date.now();
    const updateResult = await retryHandler.call(this, async () => {
      return await this.client.zAdd("users:presence", { score: lastSeenTime, value: userId }, {
        comparison: 'GT'
      });
    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: true,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 5,
      retryAfterErrorDelay: 0,
      failureCallback: () => {
        console.log("redisCache updateUserPresence failed");
      }
    });

    if (updateResult.failed) {
      await this.client.quit();
    }

    return updateResult;
  }

  async checkUserPresence(userId) {
    return await retryHandler.call(this, async () => {
      if (!userId) return;
      return await this.client.zScore("users:presence", userId);
    }, {
      failureCallback: () => {
        console.log("redisCache checkUserPresence failed");
      }
    });
  }

  async getMessageHash(messageId) {
    return await retryHandler.call(this, async () => {
      return await this.client.hGetAll(`message_hash:${messageId.toString()}`);
    });
  }

  async getNotificationHash(notificationId) {
    return await retryHandler.call(this, async () => {
      return await this.client.hGetAll(`notification_hash:${notificationId.toString()}`);
    });
  }

  async getMsgAckHash(entryId) {
    return await retryHandler.call(this, async () => {
      return await this.client.hGetAll(`msg_ack_hash:${entryId}`);
    });
  }

  async deleteMsgAckInMemoryForSender(entryId, userId) {
    return await retryHandler.call(this, async () => {
      return await this.client.zRem(`msg_acks:user:${userId}`, entryId);
    })
  }

  async updateMemberToAcked(messageId, memberPositionInAckTrack) {
    return await retryHandler.call(this, async () => {
      return await this.client.setBit(`ack_track:${messageId}`, memberPositionInAckTrack, 1);
    });
  }

  async updateMemberToAckedForNotification(notificationId, memberPositionInAckTrack) {
    return await retryHandler.call(this, async () => {
      return await this.client.setBit(`ack_track:noti:${notificationId}`, memberPositionInAckTrack, 1);
    });
  }

  async updateMemberToAckedForMsgAck(entryId) {
    return await retryHandler.call(this, async () => {
      return await this.client.setBit(`ack_track:msg_ack:${entryId}`, 0, 1);
    });
  }

  async getMemberPosForBitMap(chatId, memberUserId, chatVersion) {
    return await retryHandler.call(this, async () => {
      return (await this.client.multi()
        .hGet(`chat:${chatId}:members:v${chatVersion}`, memberUserId)
        .expire(`chat:${chatId}:members:v${chatVersion}`, MEMBERS_HASH_TTL)
        .exec())[0]
    });
  }

  async getTempReceiverPosForBitMap(eventId, memberUserId) {
    return await retryHandler.call(this, async () => {
      return await this.client.hGet(`temp:${eventId}:receivers`, memberUserId);
    });
  }

  async addMessageInMemoryInboxForUser(content, receiverIds, chatVersion) {
    const messageId = content._id;
    const entryId = content._id;
    const entryType = "message";
    const contentForHash = {
      ...content,
      chatVersion,
      firstDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      secondDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      thirdDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      forthDbAttempt: DbAttemptStatus.NOT_INITIALIZED
    }

    return await retryHandler.call(this, async () => {
      const addingTime = Date.now();
      const pipeline = this.client.multi();

      pipeline
        .hSet(`${entryType}_hash:${entryId.toString()}`, contentForHash)
        .expire(`${entryType}_hash:${entryId.toString()}`, 120);


      receiverIds.forEach((receiverId) => {
        if (receiverId === content.sender) return;
        pipeline.zAdd(`inbox:user:${receiverId}`, [{ score: addingTime, value: messageId }], {
          condition: "NX"
        });
      });

      return await pipeline.execAsPipeline();
    });
  }

  async addMsgAckInMemoryForSender(content, receiverId, senderId) {
    const { messageId, ackType } = content;
    const entryType = "msg_ack";
    const entryId = crypto
      .createHash('sha256')
      .update(`${messageId}:${ackType}:${receiverId ?? ""}`)
      .digest("base64");

    const contentForHash = {
      ...content,
      firstDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      secondDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      thirdDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      forthDbAttempt: DbAttemptStatus.NOT_INITIALIZED
    }

    return await retryHandler.call(this, async () => {
      return await this.client.multi()
        .hSet(`${entryType}_hash:${entryId}`, contentForHash)
        .expire(`${entryType}_hash:${entryId}`, 120)
        .zAdd(`msg_acks:user:${senderId}`, { score: Date.now(), value: `${entryId}` }, {
          condition: "NX"
        })
        .execAsPipeline()
    });
  }

  async deleteMessageInMemoryInboxForUser(messageId, userId) {
    return await retryHandler.call(this, async () => {
      return await this.client.zRem(`inbox:user:${userId}`, messageId);
    })
  }

  async deleteNotificationInMemoryForUser(notificationId, userId) {
    return await retryHandler.call(this, async () => {
      return await this.client.zRem(`notifications:user:${userId}`, notificationId);
    })
  }

  async getAndUpdateSequenceId(chatId) {
    return await retryHandler.call(this, async () => {
      const newSequenceId = await this.client.getAndUpdateSequenceId(`sequence_id:${chatId}`);
      await this.client.xAdd("dirty_stream", "*", chatId);
      return newSequenceId;
    });
  }

  async getOrAddSequenceId(chatId, sequenceId) {
    return await retryHandler.call(this, async () => {
      const newSequenceId = await this.client.getAndUpdateSequenceId2(`sequence_id:${chatId}`, sequenceId.toString());
      await this.client.xAdd("dirty_stream", "*", chatId);
      return newSequenceId;
    });
  }

}


const redisCache = new RedisCacheManager();

class PubSubSubscriberManager {

  constructor() {
    if (PubSubSubscriberManager._instance) {
      return PubSubSubscriberManager._instance;
    }

    this.isConnected = false;
    this.activeChannels = new Set();
    this.client = createClient();
    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("PubSub Client Error", e);
      })
      .on('ready', async () => {
        this.isConnected = true;
        console.log("PubSub Connected");
      })
      .connect();

    PubSubSubscriberManager._instance = this;
  }


  async subscribeUser(userId) {
    return await retryHandler.call(this, async () => {
      if (this.activeChannels.has(userId)) {
        return;
      }
      await this.client.subscribe(userId, pubSubMessage => {
        this.handleMessage(userId, pubSubMessage);
      });

      this.activeChannels.add(userId);

      console.log("SUBSCRIBED the userId: ", userId);
    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: false,
      retryAfterConnectionDelay: 2000,
      maximumRetries: 5,
      retryAfterErrorDelay: 2000,
      failureCallback: () => {
        console.log("redisPubSubSubscriber subscribeUser failed");
      }
    });

  }

  async unsubscribeUser(userId) {
    await retryHandler.call(this, async () => {
      console.log("unsubscribing user ", userId);
      await this.client.unsubscribe(userId);
      this.activeChannels.delete(userId);
    }, {
      maximumRetries: 5,
      retryAfterErrorDelay: 2000,
      failureCallback: () => {
        console.log("redisPubSubSubscriber unsubscribeUser failed");
      }
    });

  }

  async handleMessage(userId, pubSubMessage) {
    try {
      const parsedMessage = JSON.parse(pubSubMessage);
      const { type, messageToSend } = parsedMessage;
      io.in(userId).emit(type, messageToSend);
    } catch (error) {
      console.log("redisSubscriber handleMessage failed: ", error);
    }

  }

}

const pubSubSubscriber = new PubSubSubscriberManager();

class PubSubPublisherManager {
  constructor() {
    if (PubSubPublisherManager._instance) {
      return PubSubPublisherManager._instance;
    }

    this.isConnected = false;
    this.retries = 0;
    this.client = createClient();
    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("PubSub Client Error", e);
      })
      .on('ready', () => {
        this.isConnected = true;
        console.log("PubSub Connected");
      })
      .connect();

    PubSubPublisherManager._instance = this;


  }

  async publishMessage(messageType, messageToSend, memberIds, excludeId) {
    return await retryHandler.call(this, async () => {
      const pubSubMessageToSend = {
        type: messageType,
        messageToSend
      }

      const pipeline = this.client.multi();

      memberIds?.forEach(memberId => {
        if (excludeId && memberId.toString() === excludeId.toString()) return;
        pipeline.publish(memberId.toString(), JSON.stringify(pubSubMessageToSend));
      });

      await pipeline.execAsPipeline();

    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: true,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 3,
      retryAfterErrorDelay: 1000,
      failureCallback: () => {
        console.log("redisPubSubPublisher publishMessage failed");
      }
    });

  }

}

const pubSubPublisher = new PubSubPublisherManager();


class RedisStreamsAdderManager {

  constructor() {
    if (RedisStreamsAdderManager._instance) {
      return RedisStreamsAdderManager._instance;
    }
    this.isConnected = false;
    this.retries = 0;
    this.confirmedGroupExists = false;
    this.client = createClient();
    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("RedisStreamsAdder Client Error", e);
        this.confirmedGroupExists = false;
      })
      .on('ready', () => {
        this.isConnected = true;
        console.log("RedisStreamsAdder Connected");
      })
      .connect();

    RedisStreamsAdderManager._instance = this;
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
      maximumRetries: 5,
      retryAfterErrorDelay: 2000,
      failureCallback: () => {
        console.log("ensureGroupExists failed");
      }
    });


  }

  async queueToSend(content, entryType) {
    return await retryHandler.call(this, async () => {
      if (!this.confirmedGroupExists) {
        const groupExistsFunction = await this.ensureGroupExists();

        if (groupExistsFunction.failed) {
          throw new Error("ensureGroupExistsFailed");
        }
      }

      let entryId = content._id?.toString();
      if (entryType === "msg_ack") {
        entryId = crypto
          .createHash('sha256')
          .update(`${content.messageId}:${content.ackType}:${content.receiverId ?? ""}`)
          .digest("base64");
      }

      const streamEntry = {
        entryId,
        entryType
      }

      const pipeline = this.client.multi();

      await pipeline
        .xAdd("send:message", "*", JSON.stringify(streamEntry))
        .xReadGroup("send_workers", process.env.WORKER_ID, {
          key: "send:message",
          id: ">"
        })
        .exec();

    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: true,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 2,
      retryAfterErrorDelay: 1000,
      failureCallback: () => {
        console.log("redisStreamsAdder queueToSend failed");
      }
    });
  }

}

const redisStreamsAdder = new RedisStreamsAdderManager();


export {
  redisCache,
  pubSubSubscriber,
  pubSubPublisher,
  redisStreamsAdder
}
