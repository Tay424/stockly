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
  user: {
    additionalFields: {
      // Set true when an admin issues a temporary password. Cleared after the
      // attendant picks their own password on first login.
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      // Branch assignment (Harare hub / Gweru). Required for attendant sell/receive.
      locationId: {
        type: "string",
        required: false,
        input: false,
      },
      locationName: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
});
