import { Router } from "express";
import passport from "passport";
import {
  changeCurrentPassword,
  getCurrentUser,
  handleSocialLogin,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  appLaunchSyncFunction,
  updateUserAvatar,
  getBloomFilterSeed
} from "../controllers/user.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import "../passport/index.js"; // import the passport config
import {
  userChangeCurrentPasswordValidator,
  userLoginValidator,
  userRegisterValidator,
} from "../validators/user.validators.js";
import { validate } from "../validators/body.validators.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// Unsecured routes
router.route("/register").post(userRegisterValidator(), validate, registerUser);
router.route("/login").post(userLoginValidator(), validate, loginUser);
router.route("/refresh-token").post(refreshAccessToken);


// Secured routes
router.route("/logout").post(
  verifyJWT,
  logoutUser
);

router
  .route("/avatar")
  .patch(
    verifyJWT,
    upload.fields([{ name: "dpLg", maxCount: 1 }, { name: "dpSm", maxCount: 1 }]),
    updateUserAvatar);
router.route("/current-user").get(verifyJWT, getCurrentUser);

router
  .route("/change-password")
  .post(
    verifyJWT,
    userChangeCurrentPasswordValidator(),
    validate,
    changeCurrentPassword
  );


// SSO routes
router.route("/google").get(
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
  (_, res) => {
    res.send("redirecting to google...");
  }
);

router.route("/github").get(
  passport.authenticate("github", {
    scope: ["profile", "email"],
  }),
  (_, res) => {
    res.send("redirecting to github...");
  }
);

router.route("/facebook").get(
  passport.authenticate("facebook", {
    scope: ["public_profile"],
  }),
  (_, res) => {
    res.send("redirecting to facebook...");
  }
);

router
  .route("/google/callback")
  .get(passport.authenticate("google"), handleSocialLogin);

router
  .route("/github/callback")
  .get(passport.authenticate("github"), handleSocialLogin);

router
  .route("/facebook/callback")
  .get(passport.authenticate("facebook"), handleSocialLogin);

router
  .route("/get_bloom_seed")
  .get(
    verifyJWT,
    getBloomFilterSeed
  );

router
  .route("/app_launch_sync")
  .get(
    verifyJWT,
    appLaunchSyncFunction
  );


export default router;
