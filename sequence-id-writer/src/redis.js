import { Chat } from "./models/chat.model.js";
import { createClient } from "redis";
import mongoose from "mongoose";

const BATCH_LIMIT = 1000;
const TIME_LIMIT = 5000;
const STREAM_KEY = "dirty_stream";
const GROUP_NAME = "sequence_id_writers";
const CONSUMER_NAME = process.env.WORKER_ID?.toString();

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

class RedisDirtyStreamsReaderManager {
  constructor() {
    if (RedisDirtyStreamsReaderManager._instance) {
      return RedisDirtyStreamsReaderManager._instance;
    }

    this.isConnected = false;
    this.startedWorkingBefore = false;
    this.exitedWhileLoop = false;
    this.confirmedGroupExists = false;
    this.buffer = [];
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

    RedisDirtyStreamsReaderManager._instance = this;
  }


  async ensureGroupExists() {
    return await retryHandler.call(this, async () => {
      //check if stream exists, if not, create stream and group
      let groupExists = false;
      const streamExists = await this.client.exists(STREAM_KEY);
      if (streamExists) {
        const groupsArray = await this.client.xInfoGroups(STREAM_KEY);
        const groupIndex = groupsArray.findIndex(group => group.name === GROUP_NAME);
        if (groupIndex !== -1) {
          groupExists = true;
        }
      }

      if (!groupExists) {
        await this.client.xGroupCreate(
          STREAM_KEY,
          GROUP_NAME,
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
    this.bufferStartTime = 0;
    this.startedWorkingBefore = true;
    while (this.isConnected) {

      try {
        const timeSinceBufferStart = this.bufferStartTime ? (Date.now() - this.bufferStartTime) : 0;
        this.exitedWhileLoop = false;

        if (!this.confirmedGroupExists) {
          const groupExistsFunction = await this.ensureGroupExists();

          if (groupExistsFunction.failed) {
            throw new Error("ensureGroupExistsFailed");
          }
        }

        const rawResult = await this.client.xReadGroup(
          GROUP_NAME,
          CONSUMER_NAME,
          {
            key: STREAM_KEY,
            id: '>'
          }, {
          COUNT: BATCH_LIMIT - this.buffer.length,
          BLOCK: this.buffer.length ? Math.max(100, (TIME_LIMIT - timeSinceBufferStart)) : 0
        },
        );

        //since it returned, buffer will be started
        if (!this.buffer.length) {
          this.bufferStartTime = Date.now();
        }


        rawResult?.[0]?.messages.forEach(message => {
          if (!message) return;
          const chatId = Object.values(message.message).join("");
          this.buffer.push({ id: message.id, chatId });
        });


        if (this.buffer.length && (this.buffer.length >= BATCH_LIMIT || (this.bufferStartTime && (Date.now() - this.bufferStartTime) >= TIME_LIMIT))) {
          const uniqueIds = new Set();
          //get all seq ids from redis
          // make a map of them
          // then add those to db using bulkwrite
          this.buffer.forEach(({ chatId }) => {
            uniqueIds.add(chatId);
          });

          const uniqueIdsArray = Array.from(uniqueIds);

          const sequenceIdsPipeline = this.client.multi();
          uniqueIdsArray.forEach(chatId => {
            sequenceIdsPipeline.get(`sequence_id:${chatId}`);
          });

          const sequenceIdsArray = await sequenceIdsPipeline.execAsPipeline();

          const bulkOperations = [];

          uniqueIdsArray.forEach((chatId, index) => {
            if (sequenceIdsArray[index]) {
              bulkOperations.push({
                updateOne: {
                  filter: { _id: new mongoose.Types.ObjectId(chatId) },
                  update: { lastSequenceId: sequenceIdsArray[index] }
                }
              });
            }
          });


          await Chat.bulkWrite(bulkOperations, {
            ordered: false
          });


          await this.client.xAck(STREAM_KEY, GROUP_NAME, this.buffer.map(m => m.id));

          //reset the bufferStartTime
          this.bufferStartTime = 0;
          this.buffer = [];

        }

      } catch (error) {
        console.log("startWorking error occured: ", error);
      }

    }

    this.exitedWhileLoop = true;

  }

}

export const redisDirtyStreamsReader = new RedisDirtyStreamsReaderManager();
