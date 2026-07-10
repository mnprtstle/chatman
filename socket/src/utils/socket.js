import { Server } from "socket.io";
import { createServer } from "http";

const httpServer = createServer();
export const io = new Server(httpServer, {
    pingTimeout: 60000,
    cors: {
        origin: process.env.CORS_ORIGIN,
        credentials: true
    }
});


httpServer.listen(process.env.PORT, process.env.HOST);  