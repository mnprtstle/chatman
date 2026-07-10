import "dotenv/config";
import connectDB from "./db.js";
import { redisStreamsRetryReader } from "./redis.js";

connectDB()
  .then(() => {
    redisStreamsRetryReader.startWorking();
  })
  .catch((err) => {
    console.log("Mongo db connect error: ", err);
  });
