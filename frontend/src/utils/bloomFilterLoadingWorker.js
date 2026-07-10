import { BloomFilter } from "./bloomFilter";
import { idb } from "../indexedDB";

const IDB_BATCH_COUNT = 100;

self.onmessage = async function (event) {

  const { bloomHashSeed, minBloomFilterDaysLength, eachBloomFilterCapacity, hashFunctionCount, loggedInUserId } = event.data;

  const minBloomFilterMsLength = minBloomFilterDaysLength * 24 * 60 * 60 * 1000;

  const filters = [
    new BloomFilter(eachBloomFilterCapacity, hashFunctionCount, bloomHashSeed),
    new BloomFilter(eachBloomFilterCapacity, hashFunctionCount, bloomHashSeed),
    new BloomFilter(eachBloomFilterCapacity, hashFunctionCount, bloomHashSeed)
  ]

  let activeFilterIndex = 1;

  const oldestMessageTimestamp = Date.now() - minBloomFilterMsLength;
  const maxMessageCount = eachBloomFilterCapacity * 3;
  let lastSwapTime = Date.now();

  let nextFilterSwapTimestamp = lastSwapTime - (minBloomFilterMsLength / 2);

  let lastDeviceTimeFetched;

  for (let i = 0; i < maxMessageCount; i += IDB_BATCH_COUNT) {

    const fetchedMessageIdsInArray = await idb.loadReceivedMessageIdsToArrayInDesc(lastDeviceTimeFetched, IDB_BATCH_COUNT, oldestMessageTimestamp, { fetchDeviceTime: true, loggedInUserIdForWorker: loggedInUserId });

    if (fetchedMessageIdsInArray.failed) {
      self.postMessage({ failed: true });
      break;
    }

    const fetchedArray = fetchedMessageIdsInArray.result;

    const fetchedMessagesLength = fetchedArray?.length;

    if (fetchedMessagesLength) {
      // push them in filters
      fetchedArray.forEach(message => {
        // for every message, check if the deviceTime is less than the next swap time. if it is, swap the filter used
        if (message.deviceTime < nextFilterSwapTimestamp) {
          //swap the filter
          activeFilterIndex = activeFilterIndex - 1;
          nextFilterSwapTimestamp = nextFilterSwapTimestamp - (minBloomFilterMsLength / 2);
        }

        const activeFilter = filters[activeFilterIndex];

        activeFilter.add(message._id);
      });

    } else {
      break;
    }

    if (fetchedMessagesLength < IDB_BATCH_COUNT) {
      // this would mean that there are no more messages
      break;
    }

    lastDeviceTimeFetched = fetchedMessageIdsInArray.lastDeviceTime;

  }

  const filtersToReturn = filters.map(filter => filter._filter)

  activeFilterIndex = 2;

  const bloomFilterObjectToReturn = {
    activeFilterIndex,
    filters: filtersToReturn,
    lastSwapTime
  }

  // Send result back to main thread
  self.postMessage({ result: bloomFilterObjectToReturn, failed: false });
};
