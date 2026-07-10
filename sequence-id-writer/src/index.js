import "dotenv/config";
import connectDB from "./db.js";
import { redisDirtyStreamsReader } from "./redis.js";

connectDB()
  .then(() => {
    redisDirtyStreamsReader.startWorking();
  })
  .catch((err) => {
    console.log("Mongo db connect error: ", err);
    //stop working
  });
