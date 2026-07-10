import { createClient, defineScript } from "redis";
import { ChatEventEnum, DbAttemptStatus } from "../constants.js";
import crypto from "crypto";

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
    } = options ?? {};

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
          console.log("error: ", error);
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
    this.client = createClient();
    this.confirmedGroupExists = false;
    this.client
      .on("error", e => {
        this.isConnected = false;
        this.confirmedGroupExists = false;
        console.log("RedisStreamsAdder Client Error", e);
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


      let entryId = content._id;
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
                        redis.call("SETEX", KEYS[1], 5 * 60, newValue)
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
                    redis.call("SETEX", KEYS[1], 5 * 60, newValue)
                    redis.log(redis.LOG_VERBOSE, "found it")
                    redis.log(redis.LOG_VERBOSE, newValue)
                    return newValue
                    else 
                    redis.call("SETEX", KEYS[1], 5 * 60, ARGV[1])
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
        }),

        getOrSetAndGetChatVersion: defineScript({
          NUMBER_OF_KEYS: 1,

          SCRIPT: `
              local value = redis.call("get", KEYS[1])
              redis.log(redis.LOG_VERBOSE, "value is ")
              redis.log(redis.LOG_VERBOSE, value)
              if value then
              local return_value = {}
              local return_value = { neededToSet = false, version = value }
              redis.log(redis.LOG_VERBOSE, "return_value is ")
              redis.log(redis.LOG_VERBOSE, return_value)
              return cjson.encode(return_value)
              else
              redis.call("SETEX", KEYS[1], ${MEMBERS_HASH_TTL}, ARGV[1])
              local return_value = { neededToSet = true, version = ARGV[1] }
              redis.log(redis.LOG_VERBOSE, "return_value is ")
              redis.log(redis.LOG_VERBOSE, return_value)
              return cjson.encode(return_value)
              end
          `,
          FIRST_KEY_INDEX: 1,
          parseCommand(parser, key, arg) {
            parser.pushKey(key);
            parser.push(arg);
          },
        }),

        incAndGetChatVersion: defineScript({
          NUMBER_OF_KEYS: 1,

          SCRIPT: `
              local value = redis.call("get", KEYS[1])
              redis.log(redis.LOG_VERBOSE, "value is ")
              redis.log(redis.LOG_VERBOSE, value)
              if value then
              local new_value = tostring(tonumber(value + 1))
              redis.call("SETEX", KEYS[1], ${MEMBERS_HASH_TTL}, new_value)
              redis.log(redis.LOG_VERBOSE, "new_value is ")
              redis.log(redis.LOG_VERBOSE, new_value)
              return new_value 
              else
              redis.call("SETEX", KEYS[1], ${MEMBERS_HASH_TTL}, ARGV[1])
              redis.log(redis.LOG_VERBOSE, "new_value is ")
              redis.log(redis.LOG_VERBOSE, ARGV[1])
              return ARGV[1]
              end
          `,
          FIRST_KEY_INDEX: 1,
          parseCommand(parser, key, arg) {
            parser.pushKey(key);
            parser.push(arg);
          },
        }),
      }
    });

    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("Redis Cache Client Error", e);
      })
      .on('ready', () => {
        this.isConnected = true
        console.log("Redis Cache Connected")
      })
      .connect();

    RedisCacheManager._instance = this;

  }


  getNotificationsForUser(userId) {
    return retryHandler.call(this, async () => {
      const notificationIds = await this.client.zRangeByScore(`notifications:user:${userId}`, "-inf", "+inf");

      const notificationPipeline = this.client.multi();
      notificationIds.forEach(id => {
        notificationPipeline.hmGet(`notification_hash:${id}`, ['messageToSend', 'notificationType']);
      });

      const notificationPipelineResult = await notificationPipeline.execAsPipeline();

      const notifications = notificationPipelineResult.map(n => (n[0] ? ({ messageToSend: JSON.parse(n[0]), notificationType: n[1] }) : ({})));

      const msgAckIds = await this.client.zRangeByScore(`msg_acks:user:${userId}`, "-inf", "+inf");

      const msgAckPipeline = this.client.multi();
      msgAckIds.forEach(id => {
        msgAckPipeline.hGetAll(`msg_ack_hash:${id}`);
      })

      const msgAckPipelineResult = await msgAckPipeline.execAsPipeline();

      msgAckPipelineResult.forEach(a => {
        if (a.messageId) {
          notifications.push({
            messageToSend: {
              ...a,
              firstDbAttempt: undefined,
              secondDbAttempt: undefined,
              thirdDbAttempt: undefined,
              forthDbAttempt: undefined,
            },
            notificationType: ChatEventEnum.MSG_ACK_EVENT
          });
        } else {
          notifications.push({});
        }
      });

      const resultToReturn = notifications;

      return resultToReturn;

    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: true,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 2,
      retryAfterErrorDelay: 1000,
      failureCallback: () => {
        console.log("redisCache getNotificationsForUser failed");
      }
    });
  }

  async getInboxMessagesForUser(userId) {
    return await retryHandler.call(this, async () => {
      const messageIds = await this.client.zRangeByScore(`inbox:user:${userId}`, "-inf", "+inf");
      const pipeline = this.client.multi();
      messageIds.forEach(id => {
        pipeline.hGetAll(`message_hash:${id}`);
      });

      const pipelineResult = await pipeline.execAsPipeline();

      const inboxMessages = pipelineResult.map(p => (p._id ? ({
        ...p,
        createdAt: Number(p.createdAt),
        firstDbAttempt: undefined,
        secondDbAttempt: undefined,
        thirdDbAttempt: undefined,
        forthDbAttempt: undefined,
        chatVersion: undefined
      }) : ({})));

      return inboxMessages;

    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: true,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 2,
      retryAfterErrorDelay: 1000,
      failureCallback: () => {
        console.log("redisCache getInboxMessagesForUser failed");
      }
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

    if (contentForHash?.audioDuration) {
      contentForHash.audioDuration = contentForHash.audioDuration.toString()
    }

    return await retryHandler.call(this, async () => {
      const addingTime = Date.now();
      const pipeline = this.client.multi();

      pipeline.hSet(`${entryType}_hash:${entryId.toString()}`, contentForHash)
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
    return await retryHandler.call(this, async () => {
      const { messageId, ackType } = content;
      const entryType = "msg_ack";
      let entryId;

      entryId = crypto
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

      return await this.client.multi()
        .hSet(`${entryType}_hash:${entryId}`, contentForHash)
        .expire(`${entryType}_hash:${entryId}`, 120)
        .zAdd(`msg_acks:user:${senderId}`, { score: Date.now(), value: `${entryId}` }, {
          condition: "NX"
        })
        .execAsPipeline()
    });
  }


  async addNotificationInMemoryForUser(objectToAdd, receiverIds, chatVersion) {
    const { messageToSend, excludeIds = [], chatId, notificationType } = objectToAdd;
    const entryId = messageToSend.notifyingMessage._id;
    const entryType = "notification";

    const redisHashPreppedObjectToAdd = { messageToSend: JSON.stringify(messageToSend), notificationType }

    if (chatId) {
      redisHashPreppedObjectToAdd.chat = chatId.toString();
      redisHashPreppedObjectToAdd.chatVersion = chatVersion;
    } else {
      redisHashPreppedObjectToAdd.tempReceivingIds = "true";
    }

    if (excludeIds.length) {
      redisHashPreppedObjectToAdd.excludeIds = JSON.stringify(excludeIds);
    }

    const contentForHash = {
      ...redisHashPreppedObjectToAdd,
      messageId: entryId.toString(),
      firstDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      secondDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      thirdDbAttempt: DbAttemptStatus.NOT_INITIALIZED,
      forthDbAttempt: DbAttemptStatus.NOT_INITIALIZED
    }

    return await retryHandler.call(this, async () => {
      const addingTime = Date.now();
      const pipeline = this.client.multi();

      pipeline.hSet(`${entryType}_hash:${entryId.toString()}`, contentForHash)
        .expire(`${entryType}_hash:${entryId.toString()}`, 120);

      receiverIds.forEach(receiverId => {
        if (excludeIds.includes(receiverId.toString())) return;
        pipeline.zAdd(`notifications:user:${receiverId.toString()}`, { score: addingTime, value: entryId.toString() }, {
          condition: "NX"
        });
      })


      if (!chatId) {
        const tempReceiversHash = {}

        receiverIds?.forEach((id, i) => {
          tempReceiversHash[id.toString()] = i;
        });

        pipeline.hSetEx(`temp:${entryId.toString()}:receivers`, tempReceiversHash)
          .expire(`temp:${entryId.toString()}:receivers`, 120);
      }


      return await pipeline.execAsPipeline();
    });
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

  async getOrSetAndGetChatVersion(chatId, participants) {
    return await retryHandler.call(this, async () => {
      const chatVersionResult = await this.client.getOrSetAndGetChatVersion(`chat:${chatId.toString()}:members:cv`, "1")
      const { neededToSet, version: chatVersion } = JSON.parse(chatVersionResult);

      if (neededToSet) {
        const chatMembersObject = {}
        participants.forEach((p, i) => {
          chatMembersObject[p.toString()] = i;
        });

        await this.client.multi()
          .hSet(`chat:${chatId}:members:v${chatVersion}`, chatMembersObject)
          .expire(`chat:${chatId}:members:v${chatVersion}`, MEMBERS_HASH_TTL)
          .exec();
      }

      return chatVersion;
    });
  }

  async incAndGetChatVersion(chatId, participants) {
    return retryHandler.call(this, async () => {
      const chatVersion = await this.client.incAndGetChatVersion(`chat:${chatId.toString()}:members:cv`, "2");
      const chatMembersObject = {}
      participants.forEach((p, i) => {
        chatMembersObject[p.toString()] = i;
      });

      await this.client.multi()
        .hSet(`chat:${chatId}:members:v${chatVersion}`, chatMembersObject)
        .expire(`chat:${chatId}:members:v${chatVersion}`, MEMBERS_HASH_TTL)
        .exec();

      return chatVersion;
    });
  }


}

const redisCache = new RedisCacheManager();

export {
  pubSubPublisher,
  redisStreamsAdder,
  redisCache
}
