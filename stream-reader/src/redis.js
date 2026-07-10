import { createClient } from "redis";

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


class RedisSendStreamsReaderManager {
  constructor() {
    if (RedisSendStreamsReaderManager._instance) {
      return RedisSendStreamsReaderManager._instance;
    }

    this.isConnected = false;
    this.startedWorkingBefore = false;
    this.exitedWhileLoop = false;
    this.confirmedGroupExists = false;
    this.client = createClient();
    this.client
      .on("error", e => {
        this.isConnected = false;
        console.log("RedisSendStreamsReader Client Error", e);
      })
      .on('ready', () => {
        this.isConnected = true;
        this.confirmedGroupExists = false;
        console.log("RedisSendStreamsReader Connected");

        if (this.startedWorkingBefore && this.exitedWhileLoop) {
          this.startWorking();
        }
      })
      .connect();

    RedisSendStreamsReaderManager._instance = this;
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

        await this.client.xReadGroup(
          'send_workers',
          process.env.WORKER_ID,
          {
            key: 'send:message',
            id: '>'
          }, {
          COUNT: 20,
          BLOCK: 0
        },
        );

      } catch (error) {
        console.log("startWorking error occured: ", error);
      }

    }


    this.exitedWhileLoop = true;

  }


}

const redisSendStreamsReader = new RedisSendStreamsReaderManager();


export {
  redisSendStreamsReader
}
