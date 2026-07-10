import "dotenv/config";
import { redisSendStreamsReader } from "./redis.js";

// to only read the send:message stream in case any reads in socket server fail
redisSendStreamsReader.startWorking();

