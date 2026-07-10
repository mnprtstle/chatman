import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import logger from "../logger/winston.logger.js";
import { GridFSBucket } from "mongodb";


export let dbInstance = undefined;
export let gfsBucket = undefined;
export let gfsBucketVoice = undefined;
export let gfsBucketDP = undefined;

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    // initialize gridfs buckets
    const db = mongoose.connection.db;
    // for file attachments, except voice recordings
    gfsBucket = new GridFSBucket(db);
    // for voice recordings
    gfsBucketVoice = new GridFSBucket(db, {
      bucketName: 'voices',
    });
    // for display photos
    gfsBucketDP = new GridFSBucket(db, {
      bucketName: 'dp',
    });

    console.log('All gridfs buckets initialized');

    dbInstance = connectionInstance;
    logger.info(
      `\n MongoDB Connected! Db host: ${connectionInstance.connection.host}\n`
    );
  } catch (error) {
    logger.error("MongoDB connection error: ", error);
    process.exit(1);
  }
};

export default connectDB;

