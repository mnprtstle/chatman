import { ACCEPTED_MIME_TYPES } from "../constants.js";
import { Chat } from "../models/chat.model.js";
import { redisCache } from "./redis.js";

export const filterObjectKeys = (fieldsArray, objectArray) => {
  const filteredArray = structuredClone(objectArray).map((originalObj) => {
    let obj = {};
    structuredClone(fieldsArray)?.forEach((field) => {
      if (field?.trim() in originalObj) {
        obj[field] = originalObj[field];
      }
    });
    if (Object.keys(obj).length > 0) return obj;
    return originalObj;
  });
  return filteredArray;
};

export const getPaginatedPayload = (dataArray, page, limit) => {
  const startPosition = +(page - 1) * limit;

  const totalItems = dataArray.length; // total documents present after applying search query
  const totalPages = Math.ceil(totalItems / limit);

  dataArray = structuredClone(dataArray).slice(
    startPosition,
    startPosition + limit
  );

  const payload = {
    page,
    limit,
    totalPages,
    previousPage: page > 1,
    nextPage: page < totalPages,
    totalItems,
    currentPageItems: dataArray?.length,
    data: dataArray,
  };
  return payload;
};




export const getMongoosePaginationOptions = ({
  page = 1,
  limit = 10,
  customLabels,
}) => {
  return {
    page: Math.max(page, 1),
    limit: Math.max(limit, 1),
    pagination: true,
    customLabels: {
      pagingCounter: "serialNumberStartFrom",
      ...customLabels,
    },
  };
};

export const timestampMsConversion = () => {
  return [
    {
      $set: {
        createdAt: { $toLong: "$createdAt" },
        updatedAt: { $toLong: "$updatedAt" }
      }
    }
  ]
}


export const getSequenceId = async (chatId, alreadyFetchedLastSequenceIdFromDb) => {
  let sequenceIdInRedis
  if (!alreadyFetchedLastSequenceIdFromDb) {
    sequenceIdInRedis = await redisCache.getAndUpdateSequenceId(chatId);
  }

  if (sequenceIdInRedis?.result) {
    return sequenceIdInRedis;
  } else {
    let lastSequenceIdFromDb;
    if (alreadyFetchedLastSequenceIdFromDb) {
      lastSequenceIdFromDb = alreadyFetchedLastSequenceIdFromDb;
    } else {
      const resultFromDb = await Chat.findById(chatId).select("lastSequenceId")
      lastSequenceIdFromDb = resultFromDb.lastSequenceId;
    }


    const sequenceIdUpdateInRedisAfterUpdate = await redisCache.getOrAddSequenceId(chatId, (lastSequenceIdFromDb || 0) + 1);

    return sequenceIdUpdateInRedisAfterUpdate;
  }

}


export const validateMimeType = (mimeType) => {
  if (ACCEPTED_MIME_TYPES.includes(mimeType)) {
    return { isValid: true }
  } else {
    return { isValid: false }
  }
}
