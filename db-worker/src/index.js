import "dotenv/config";
import connectDB from "./db.js";
import { redisStreamsReader } from "./redis.js";

connectDB()
  .then(() => {
    redisStreamsReader.startWorking();
  })
  .catch((err) => {
    console.log("Mongo db connect error: ", err);
  });
