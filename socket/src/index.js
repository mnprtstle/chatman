import "dotenv/config"
import cookie from "cookie";
import { ChatEventEnum } from "./constants.js";
import { ApiError } from "./utils/ApiError.js";
import { ParticipantStoppedTypingEvent, ParticipantTypingEvent, heartbeatEvent } from "./clientEvents/otherEvents.js";
import { ackEvent, messageReceivedEvent, msgAckEvent } from "./clientEvents/messageEvents.js";
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { pubSubSubscriber } from "./utils/redis.js";
import { io } from "./utils/socket.js";
import axios from "axios";

// to rate-limit incoming messages
const rateLimiter = new RateLimiterMemory(
  {
    points: 50,
    duration: 5,
    // 50 message events allowed every 5 secs
  });


//Auth middleware
io.use(async (socket, next) => {
  try {
    const cookies = cookie.parse(socket.handshake.headers?.cookie || "");
    let token = cookies?.accessToken;

    if (!token) {
      token = socket.handshake.auth?.token;
    }

    if (!token) {
      throw new ApiError(401, "Un-authorized handshake. Token is missing");
    }

    const authResult = await axios.post(`${process.env.BACKEND_URL}/api/v1/ws/verify_token`, {
      userToken: token
    }, {
      headers: {
        'Authorization': process.env.SOCKET_BACKEND_KEY
      }
    });

    if (!authResult.data?.data?.decodedToken) {
      throw new ApiError(401, "Un-authorized handshake");
    }

    socket.user = { _id: authResult.data.data.decodedToken._id }

    next();

  } catch (error) {
    console.error('JWT verification failed:', error.message);
    const err = new Error("Authentication Error");
    err.message = error?.message;
    err.data = new ApiError(401, 'Authentication error: Invalid token');
    return next(err);
  }
});


io.on("connection", async (socket) => {
  try {
    socket.join(socket.user._id.toString());

    //messageEvent(s)
    messageReceivedEvent(socket, rateLimiter);
    msgAckEvent(socket, rateLimiter);
    ackEvent(socket, rateLimiter);
    // otherEvents
    heartbeatEvent(socket);
    ParticipantTypingEvent(socket);
    ParticipantStoppedTypingEvent(socket);

    // subscribe to pubsub
    const subscribeResult = await pubSubSubscriber.subscribeUser(socket.user._id);

    if (subscribeResult.failed) {
      throw new ApiError(500, "Failed to connect user");
    }

    socket.emit(ChatEventEnum.CONNECTED_EVENT);
    console.log("User connected 🗼. userId: ", socket.user._id.toString());

    socket.on(ChatEventEnum.DISCONNECTING_EVENT, (reason, details) => {
      const userId = socket.user?._id?.toString();

      console.log("user is disconnecting 🚫. userId: " + userId, "reason is: ", reason, details);
    })

    //diconnection event
    socket.on(ChatEventEnum.DISCONNECT_EVENT, async (reason, details) => {
      console.log("user has disconnected 🚫. userId: " + socket.user?._id, "reason is: ", reason, details);

      const transport = socket.conn.transport.name;
      console.log(`User disconnected via ${transport}. Reason: ${reason}`);

      const remainingSocketsInRoom = (await io.in(socket.user?._id.toString()).fetchSockets()).map(s => s.user._id.toString());

      if (!remainingSocketsInRoom.length) {
        await pubSubSubscriber.unsubscribeUser(socket.user?._id);
      }
    });


  } catch (error) {
    console.log("socket error event: ", error);
  }
});
