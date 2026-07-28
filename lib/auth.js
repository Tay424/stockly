import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin } from "better-auth/plugins/admin";
import { client, db } from "./db.js";

export const auth = betterAuth({
  appName: "Stockly",
  database: mongodbAdapter(db, { client }),
  emailAndPassword: {
    enabled: true,
    // Only the admin creates accounts — no public sign-up.
    disableSignUp: true,
  },
  plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
});
