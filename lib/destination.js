/** Where a signed-in user should land, honouring the forced password change. */
export function destinationFor(user) {
  if (user?.mustChangePassword) return "/change-password";
  return user?.role === "admin" ? "/admin" : "/dashboard";
}
