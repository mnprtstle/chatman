import "dotenv/config"
import { httpServer } from "./app.js";
import connectDB from "./db/index.js";
import logger from "./logger/winston.logger.js";

const startServer = () => {
    httpServer.listen(process.env.PORT || 8080, process.env.HOST || '0.0.0.0', () => {
      logger.info("Server is running on port: " + process.env.PORT);
    });
  };

  connectDB()
  .then(() => {
    startServer();
  })
  .catch((err) => {
    logger.info("Mongo db connect error: ", err);
  });