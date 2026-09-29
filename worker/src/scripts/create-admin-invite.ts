// Creates an invitation for a MOCO user and sends the invitation mail.
// Usage: node dist/scripts/create-admin-invite.js <email> [teamLevel=6]
// The email must match a user already synced from MOCO.

import { prisma } from "../db";
import { sendInvitationEmail } from "../lib/email";
import { mapMocoUnitToTeamLevel } from "../lib/mocoMapping";
import crypto from "crypto";

async function createAdminInvite() {
  const email = process.argv[2]?.toLowerCase().trim();
  const teamLevel = Number(process.argv[3] ?? 6);

  if (!email || !Number.isInteger(teamLevel) || teamLevel < 0 || teamLevel > 7) {
    console.error("Usage: create-admin-invite <email> [teamLevel 0-7, default 6]");
    process.exit(1);
  }

  console.log(`[create-admin-invite] Looking up MOCO user for ${email}...`);

  const mocoUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (!mocoUser) {
    console.error("MOCO user not found. Run a sync first or check the address.");
    process.exit(1);
  }

  console.log(`MOCO user found: ${mocoUser.firstname} ${mocoUser.lastname} (ID: ${mocoUser.id})`);
  console.log(`  Unit: ${mocoUser.unitName || "none"}`);
  console.log(`  Mapped level: ${mapMocoUnitToTeamLevel(mocoUser.unitName)}`);
  console.log(`  Level to be set: ${teamLevel}`);

  const existing = await prisma.dashboardUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Dashboard user already exists for ${email} (ID: ${existing.id}, level: ${existing.teamLevel}).`);
    console.log("Existing invitations for this address will be replaced.");
  }

  await prisma.invitation.deleteMany({ where: { email } });

  const token = crypto.randomBytes(32).toString("hex");

  // Valid for 7 days
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.invitation.create({
    data: {
      token,
      email,
      mocoUserId: mocoUser.id,
      teamLevel,
      expiresAt,
    },
  });

  console.log(`Invitation created, valid until ${expiresAt.toISOString()}`);

  const baseUrl = process.env.FRONTEND_URL || "http://localhost:8080";
  try {
    await sendInvitationEmail(email, token);
    console.log(`Invitation mail sent to ${email}.`);
  } catch (error) {
    console.error("Sending the mail failed:", error instanceof Error ? error.message : error);
    console.log(`Invitation link (manual): ${baseUrl}/accept-invite?token=${token}`);
  }
}

createAdminInvite()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
