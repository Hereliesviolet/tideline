// Script zum Zurücksetzen eines Benutzer-Passworts

import { prisma } from "../db";
import { hashPassword } from "../lib/password";

async function resetPassword() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error("Usage: ts-node reset-password.ts <email> <new-password>");
    process.exit(1);
  }

  try {
    // User finden
    const user = await prisma.dashboardUser.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      console.error(`User mit E-Mail "${email}" nicht gefunden.`);
      process.exit(1);
    }

    // Passwort hashen
    const passwordHash = await hashPassword(newPassword);

    // Passwort aktualisieren
    await prisma.dashboardUser.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    console.log(`✓ Passwort für ${user.email} wurde erfolgreich zurückgesetzt.`);
  } catch (error: any) {
    console.error("Fehler beim Zurücksetzen des Passworts:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();

