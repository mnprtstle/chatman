import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { UserLoginType } from "../constants.js";

try {
  passport.serializeUser((user, next) => {
    next(null, user._id);
  });

  passport.deserializeUser(async (id, next) => {
    try {
      const user = await User.findById(id);
      if (user) next(null, user); // return user if exists
      else next(new ApiError(404, "User does not exist"), null); // throw an error if user does not exist
    } catch (error) {
      next(
        new ApiError(
          500,
          "Something went wrong while deserializing the user. Error: " + error
        ),
        null
      );
    }
  });

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (_, __, profile, next) => {
        // Check if the user with email already exist
        const user = await User.findOne({ email: profile._json.email });
        if (user) {
          if (user.loginType !== UserLoginType.GOOGLE) {
            // If user is registered with some other method, we will ask them to use the same method as registered.
            next(
              new ApiError(
                400,
                "You have previously registered using " +
                user.loginType?.toLowerCase()?.split("_").join(" ") +
                ". Please use the " +
                user.loginType?.toLowerCase()?.split("_").join(" ") +
                " login option to access your account."
              ),
              null
            );
          } else {
            next(null, user);
          }
        } else {

          const createdUser = await User.create({
            email: profile._json.email,
            password: profile._json.sub,
            username: profile._json.email?.split("@")[0],
            fullName: `${profile._json.given_name} ${profile._json.family_name}`,
            isEmailVerified: true, // email will be already verified
            avatar: {
              ssoUrl: profile._json.picture,
            },
            loginType: UserLoginType.GOOGLE,
          });
          if (createdUser) {
            next(null, createdUser);
          } else {
            next(new ApiError(500, "Error while registering the user"), null);
          }
        }
      }
    )
  );

  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL,
      },
      async (_, __, profile, next) => {

        const user = await User.findOne({ username: (profile.username + profile._json.node_id.slice(-3)) });
        if (user) {

          next(null, user);

        } else {
          const createdUser = await User.create({
            email: profile._json.url,
            password: profile._json.node_id, // password is redundant for the SSO
            username: (profile.username + profile._json.node_id.slice(-3)),
            isEmailVerified: true, // email will be already verified
            fullName: profile._json.name,
            avatar: {
              ssoUrl: profile._json.avatar_url,
            },
            loginType: UserLoginType.GITHUB,
          });
          if (createdUser) {
            next(null, createdUser);
          } else {
            next(new ApiError(500, "Error while registering the user"), null);
          }
        }
      }
    )
  );

  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'displayName', 'name', 'photos']
      },
      async (_, __, profile, next) => {

        // Check if the user with email already exist
        const user = await User.findOne({ email: (profile._json.first_name + profile._json.id.slice(-3) + "@notanemail.com") });
        if (user) {
          next(null, user);
        } else {
          const createdUser = await User.create({
            email: (profile._json.first_name + profile._json.id.slice(-3) + "@notanemail.com"),
            password: profile._json.id,
            username: (profile._json.first_name + profile._json.id.slice(-3)),
            fullName: profile._json.name,
            isEmailVerified: true, // email will be already verified
            avatar: {
              ssoUrl: profile._json.picture.data.url,
            },
            loginType: UserLoginType.FACEBOOK,
          });
          if (createdUser) {
            next(null, createdUser);
          } else {
            next(new ApiError(500, "Error while registering the user"), null);
          }
        }
      }
    )
  );
} catch (error) {
  console.error("PASSPORT ERROR: ", error);
}
