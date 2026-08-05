import { auth } from "../lib/auth.js";
import { client } from "../lib/db.js";

const [email, password, name = "Admin"] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: pnpm create-admin <email> <password> [name]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

// Public sign-up is disabled, so the admin is seeded through better-auth's
// internal adapter instead of the sign-up endpoint.
const ctx = await auth.$context;
const existing = await ctx.internalAdapter.findUserByEmail(email);

if (existing) {
  await ctx.internalAdapter.updateUser(existing.user.id, { role: "admin" });
  console.log(`Promoted ${email} to admin.`);
} else {
  const user = await ctx.internalAdapter.createUser({
    email,
    name,
    emailVerified: true,
    role: "admin",
    mustChangePassword: false,
  });
  await ctx.internalAdapter.createAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  console.log(`Created admin ${email}.`);
}

await client.close();
