import { idb } from "../indexedDB";
import store from "../store/store";
import { BloomFilter } from "./bloomFilter";

const FIFO_CAPACITY = 300;
const FIFO_HYDRATION_COUNT = 100;
const IDB_BATCH_COUNT = 50;
// FIFO_HYDRATION_COUNT must be less than FIFO_CAPACITY
// fifo is specifically just for functions needed for the app, it doesn't refresh an entry when get is used to check for its presence
const EACH_BLOOM_FILTER_CAPACITY = 13000;
const HASH_FUNCTION_COUNT = 8;
const MIN_BLOOM_FILTER_DAYS_LENGTH = 30;
const PER_BLOOM_FILTER_DAYS_LENGTH = MIN_BLOOM_FILTER_DAYS_LENGTH / 2;
const FLUSH_MESSAGE_COUNT_THRESHOLD = 30;
const FLUSH_MESSAGE_SECONDS_THRESHOLD = 30;



class MessageDeduplicationManager {
  constructor() {
    if (MessageDeduplicationManager._instance) {
      return MessageDeduplicationManager._instance;
    }

    this.fifoCapacity = FIFO_CAPACITY;
    this.fifoCache = new Set();
    // start an fifo load from idb at the same time

    // initialize bloomfilter as not ready
    this.bloomFilterReady = false;
    // only declare the variable names for bloomfilter
    this.bloomHashSeed;
    this.bloomFilterObject;
    this.activeBloomFilter;
    this.bloomFilterFlushInterval;
    this.unflushedMessageCount = 0;

    //bloom filter is not initialized in the constructor

    return MessageDeduplicationManager._instance = this;
  }

  async initializeMessageDeduplication(bloomHashSeed) {
    // populate the FIFO Cache
    this.loadFifoCacheFromIdb();
    this.activeBloomFilter = new BloomFilter(EACH_BLOOM_FILTER_CAPACITY, HASH_FUNCTION_COUNT, bloomHashSeed);
    this.bloomHashSeed = bloomHashSeed;
    const idbResult = await idb.getBloomFilterObject();

    if (idbResult.failed) {
      alert("Unexpected error occured, please restart the app. If error persists, please contact customer support");
    }

    if (idbResult.result?.length) {
      const idbFilter = idbResult.result[0];

      if (idbFilter.bloomHashSeed === bloomHashSeed) {
        this.loadExistingBloomFilter(idbFilter);
      } else {

        this.generateNewBloomFilter();
      }

    } else {
      this.generateNewBloomFilter();
    }

  }

  async loadFifoCacheFromIdb() {
    //outsourced
    // load 50 messages x 2
    // FIFO_
    let lastDeviceTimeFetched;

    const arrayOfFetchedArrays = [];
    // only load messages from last 30 minutes max
    const oldestMessageTimeInMs = Date.now() - (30 * 60 * 1000);

    for (let i = 0; i < FIFO_HYDRATION_COUNT; i += IDB_BATCH_COUNT) {

      const fetchedMessageIdsInArray = await idb.loadReceivedMessageIdsToArrayInDesc(lastDeviceTimeFetched, IDB_BATCH_COUNT, oldestMessageTimeInMs);

      if (fetchedMessageIdsInArray.failed) {
        alert("Unexpected error occured, please restart the app. If error persists, please contact customer support");
        break;
      }

      const fetchedArray = fetchedMessageIdsInArray.result;

      const fetchedMessagesLength = fetchedArray?.length;

      if (fetchedMessagesLength) {
        arrayOfFetchedArrays.push(fetchedArray);
      } else {
        break;
      }

      if (fetchedMessagesLength < IDB_BATCH_COUNT) {
        // this would mean that there are no more messages, thus, we can break the loop
        break;
      }

      lastDeviceTimeFetched = fetchedMessageIdsInArray.lastDeviceTime;

    }


    if (arrayOfFetchedArrays.length) {
      const newFIFOCache = new Set();
      for (let m = arrayOfFetchedArrays.length - 1; m >= 0; m--) {
        for (let n = arrayOfFetchedArrays[m].length - 1; n >= 0; n--) {
          newFIFOCache.add(arrayOfFetchedArrays[m][n]);
        }
      }

      if (newFIFOCache.size > 0) {
        const oldFIFOCache = this.fifoCache;
        this.fifoCache = newFIFOCache;
        oldFIFOCache.forEach(messageId => {
          this.addToFIFO(messageId);
        })
      }

    }

  }


  async checkDuplicate(messageId) {
    // three levels
    //check fifo - false negatives, true positives
    //check bloom - false positives, true negatives
    //check idb - never lies

    const foundInLevel1 = this.checkFIFO(messageId);

    if (foundInLevel1) {
      return true;
    }

    const foundInLevel2 = this.checkBloomFilter(messageId);

    if (!foundInLevel2) {
      return false;
    } else {
      const foundInLevel3 = await this.checkIdb(messageId);
      return foundInLevel3;
    }
  }

  checkFIFO(messageId) {
    if (!this.fifoCache.has(messageId)) {
      return false;
    } else {
      return true;
    }

  }

  addToFIFO(messageId) {
    if (this.fifoCache.has(messageId)) {
      return;
    }

    if (this.fifoCache.size >= this.capacity) {
      const oldestMessageId = this.fifoCache.keys().next().value;
      this.fifoCache.delete(oldestMessageId);
    }

    this.fifoCache.add(messageId);
  }

  addMessage(messageId) {
    this.addToFIFO(messageId);
    this.addToBloomFilter(messageId);
  }

  checkBloomFilter(messageId) {
    if (this.bloomFilterReady) {
      for (const filter of this.bloomFilterObject.filters) {
        const hasResult = filter.has(messageId);
        if (hasResult) {
          return true;
        }
      }

      return false;

    } else {
      // return true always until the bloomFilterReady is not true
      return true;
    }
  }

  addToBloomFilter(messageId) {
    this.activeBloomFilter.add(messageId);
    this.unflushedMessageCount++;

    if (this.unflushedMessageCount >= FLUSH_MESSAGE_COUNT_THRESHOLD) {
      this.flushBloomFilter();

      if (this.bloomFilterFlushInterval) {
        clearInterval(this.bloomFilterFlushInterval);
        this.bloomFilterFlushInterval = setInterval(this.flushBloomFilter.bind(this), (FLUSH_MESSAGE_SECONDS_THRESHOLD * 1000));
      }
    }
  }

  loadExistingBloomFilter(idbFilter) {
    this.bloomFilterObject = {
      activeFilterIndex: idbFilter.activeFilterIndex,
      filters: idbFilter.filters.map(filter => new BloomFilter(EACH_BLOOM_FILTER_CAPACITY, HASH_FUNCTION_COUNT, this.bloomHashSeed, filter)),
      lastSwapTime: idbFilter.lastSwapTime
    }

    const currentTime = Date.now();
    const daysSinceLastSwap = (currentTime - this.bloomFilterObject.lastSwapTime) / (1000 * 60 * 60 * 24);
    //if last active filter swap was PER_BLOOM_FILTER_DAYS_LENGTH days ago or longer
    if (daysSinceLastSwap >= PER_BLOOM_FILTER_DAYS_LENGTH) {
      this.bloomFilterObject.activeFilterIndex = (this.bloomFilterObject.activeFilterIndex + 1) % 3;
      // also clear the bloom filter that is now newly active before starting
      // also change the lastSwapTime
      this.bloomFilterObject.filters[this.bloomFilterObject.activeFilterIndex].clear;
      this.bloomFilterObject.lastSwapTime = currentTime;
    }


    this.swapBloomFilter();

    this.bloomFilterFlushInterval = setInterval(this.flushBloomFilter.bind(this), (FLUSH_MESSAGE_SECONDS_THRESHOLD * 1000));

  }

  async generateNewBloomFilter() {
    if (window.Worker) {
      // Create a new Web Worker
      const myWorker = new Worker(new URL("bloomFilterLoadingWorker.js", import.meta.url), { type: "module" });

      // Send data to the worker
      myWorker.postMessage({
        bloomHashSeed: this.bloomHashSeed,
        minBloomFilterDaysLength: MIN_BLOOM_FILTER_DAYS_LENGTH,
        eachBloomFilterCapacity: EACH_BLOOM_FILTER_CAPACITY,
        hashFunctionCount: HASH_FUNCTION_COUNT,
        loggedInUserId: store.getState().auth.account?._id
      });

      // Receive data from the worker
      myWorker.onmessage = (event) => {
        if (event.data.failed) {
          alert("Unexpected error occured, please restart the app. If error persists, please contact customer support");
        } else {
          this.bloomFilterObject = {
            ...event.data.result,
            filters: event.data.result.filters.map(filter => new BloomFilter(EACH_BLOOM_FILTER_CAPACITY, HASH_FUNCTION_COUNT, this.bloomHashSeed, filter)
            )
          };

          //swap the bloom filter here
          this.swapBloomFilter();

          this.flushBloomFilter(true);
          this.bloomFilterFlushInterval = setInterval(this.flushBloomFilter.bind(this), (FLUSH_MESSAGE_SECONDS_THRESHOLD * 1000))
        }

        myWorker.terminate();
      }

      // Handle worker errors
      myWorker.onerror = function (error) {
        console.error('Error from worker:', error.message);
      };
    } else {
      alert("This browser does not support web workers API which is essential for running this application properly. Please update the browser or use a different browser");
    }
  }

  swapBloomFilter() {
    const activeFilterBits = this.bloomFilterObject.filters[this.bloomFilterObject.activeFilterIndex]._filter;

    const temporaryActiveFilterBits = this.activeBloomFilter._filter;

    // merge the temporary filter with active filter
    for (let i = 0; i < activeFilterBits.length; i++) {
      activeFilterBits[i] |= temporaryActiveFilterBits[i];
    }

    // and then replace temporary filter with permanent, persisted filter
    this.activeBloomFilter = this.bloomFilterObject.filters[this.bloomFilterObject.activeFilterIndex]
    // this.activeBloomFilter._filter = this.bloomFilterObject.filters[this.bloomFilterObject.activeFilterIndex]._filter;

    this.bloomFilterReady = true;
  }

  async flushBloomFilter(flushingForNewBloomFilterSeed) {
    if (!this.bloomFilterReady || !flushingForNewBloomFilterSeed || !this.unflushedMessageCount) return;

    const messagesToFlush = this.unflushedMessageCount;

    const filtersArrayToStore = this.bloomFilterObject.filters.map(filter => filter._filter);
    // clear interval only when triggered by count and then reset the interval
    const bloomFilterObjectToStoreInDisk = { ...this.bloomFilterObject, filters: filtersArrayToStore, bloomHashSeed: this.bloomHashSeed }
    const idbResult = await idb.updateBloomFilter(bloomFilterObjectToStoreInDisk);

    if (idbResult.failed) {
      alert("An error occured, please restart the app. If problem persists, please contact customer support");
    }

    this.unflushedMessageCount -= messagesToFlush;
  }

  async checkIdb(messageId) {
    //outsourced
    const idbResult = await idb.checkMessageIdExists(messageId);
    if (idbResult.failed) {
      alert("Something went wrong while getting a message, please restart the app. If problem persists, please contact customer support");
    } else {
      return idbResult.result;
    }
  }
}

export const messageDeduplication = new MessageDeduplicationManager();
