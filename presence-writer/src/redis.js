import { createClient, defineScript } from "redis";

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
        performZRemoves: defineScript({
          NUMBER_OF_KEYS: 1,
          SCRIPT: `
              local key = KEYS[1]

              for i = 1, #ARGV, 2 do
                local member = ARGV[i]
                local expected_score = ARGV[i+1]
 
                local current_score = redis.call('ZSCORE', key, member)
 
                if current_score == expected_score then
                  redis.call('ZREM', key, member)
                end
              end

              return 0 
          `,
          FIRST_KEY_INDEX: 1,
          parseCommand(parser, key, argsArray) {
            parser.pushKey(key);
            for (let i = 0; i < argsArray.length; i++) {
              // parser.push expects strings or Buffers. 
              parser.push(argsArray[i].toString());
            }
          }
        })
      }
    });

    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("Redis Cache Client Error", e);
      })
      .on('connect', () => {
        this.isConnected = true
        console.log("Redis Cache Connected")
      })
      .connect();

    RedisCacheManager._instance = this;
  }


  async retrievePresenceData(timeInMilliseconds, chunkSize) {
    return await retryHandler.call(this, async () => {
      return await this.client.zRangeByScoreWithScores("users:presence", '-inf', timeInMilliseconds, {
        LIMIT: {
          offset: 0,
          count: chunkSize
        }
      })

    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: false,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 2,
      retryAfterErrorDelay: 0,
      failureCallback: () => {
        console.log("redisCache retrievePresenceData failed");
      }
    });
  }

  async removePresenceDataMembers(membersToRemove) {
    return await retryHandler.call(this, async () => {
      const len = membersToRemove.length;
      const flatArgs = new Array(len * 2);

      for (let i = 0; i < len; i++) {
        const item = membersToRemove[i];
        flatArgs[i * 2] = item.value;
        flatArgs[i * 2 + 1] = item.score;
      }

      return await this.client.performZRemoves("users:presence", flatArgs);
    }, {
      retryAfterConnection: true,
      enforceRetriesAfterConnectionLimit: false,
      retryAfterConnectionDelay: 1000,
      maximumRetries: 2,
      retryAfterErrorDelay: 0,
      failureCallback: () => {
        console.log("redisCache removePresenceDataMembers failed");
      }
    })
  }


}

export const redisCache = new RedisCacheManager();
