import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import crypto from 'crypto';


function safeCompare(str1, str2) {
    const buf1 = Buffer.from(str1);
    const buf2 = Buffer.from(str2);

    if (buf1.length !== buf2.length) {
        return false;
    }

    // 2. Perform constant-time comparison
    return crypto.timingSafeEqual(buf1, buf2);
}


export const verifyWS = asyncHandler(async (req, _, next) => {


    try {
        const secretKey = req.header("Authorization");

        if (!secretKey) {
            throw new ApiError(401, "Unauthorized request");
        }

        if (safeCompare(secretKey, process.env.SOCKET_BACKEND_KEY)) {
            next();
        } else {
            throw new ApiError(401, error?.message || "Unauthorized request");
        }

    } catch (error) {
        throw new ApiError(401, error?.message || "Unauthorized request");
    }
});