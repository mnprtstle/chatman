import "dotenv/config";
import connectDB from "./db.js";
import { redisCache } from "./redis.js";
import { User } from "./models/user.model.js";
import mongoose from "mongoose";

const NEWEST_PRESENCE_TO_FETCH = 50 * 1000;
const CHUNK_SIZE = 500;
const PRESENCE_WRITING_INTERVAL = 2 * 60 * 1000;

connectDB()
  .then(async () => {
    try {
      while (true) {
        try {
          const timeCutOffInMs = Date.now() - (NEWEST_PRESENCE_TO_FETCH);
          const cacheResult = await redisCache.retrievePresenceData(timeCutOffInMs, CHUNK_SIZE);

          if (cacheResult.failed) return;

          const cacheData = cacheResult.result;

          if (cacheData?.length) {
            const operations = cacheData.map(member => (
              {
                updateOne: {
                  filter: { _id: new mongoose.Types.ObjectId(member.value) },
                  update: { lastOnline: new Date(member.score) }
                }
              }
            ));


            await User.bulkWrite(operations, {
              ordered: false
            });

            await redisCache.removePresenceDataMembers(cacheData);
          }

          if (!cacheData?.length || (cacheData?.length < CHUNK_SIZE)) {
            await new Promise(res => setTimeout(res, PRESENCE_WRITING_INTERVAL));
          }
        } catch (error) {
          console.log("presence-writer error: ", error);
        }

      }

    } catch (error) {
      console.log("error occured: ", error);
    }

  })
  .catch((err) => {
    console.log("Mongo db connect error: ", err);
  });
