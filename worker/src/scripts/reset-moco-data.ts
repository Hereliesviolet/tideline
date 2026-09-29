// Deletes all data synced from MOCO (e.g. when switching to another MOCO account).
// NOTE: DashboardUser rows are NOT deleted (local accounts).

import { prisma } from "../db";

async function resetMocoData() {
  console.log("🔄 Starte Zurücksetzen aller MOCO-Daten...");
  
  try {
    // Reihenfolge ist wichtig wegen Foreign Keys!
    // Zuerst abhängige Tabellen, dann Haupttabellen
    
    console.log("  📋 Lösche Activities...");
    await prisma.activity.deleteMany({});
    
    console.log("  📋 Lösche Planning Entries...");
    await prisma.planningEntry.deleteMany({});
    
    console.log("  📋 Lösche Schedules...");
    await prisma.schedule.deleteMany({});
    
    console.log("  📋 Lösche User Presences...");
    await prisma.userPresence.deleteMany({});
    
    console.log("  📋 Lösche Work Time Adjustments...");
    await prisma.workTimeAdjustment.deleteMany({});
    
    console.log("  📋 Lösche User Holidays...");
    await prisma.userHoliday.deleteMany({});
    
    console.log("  📋 Lösche Employments...");
    await prisma.employment.deleteMany({});
    
    console.log("  📋 Lösche Tasks...");
    await prisma.task.deleteMany({});
    
    console.log("  📋 Lösche Project Contracts...");
    await prisma.projectContract.deleteMany({});
    
    console.log("  📋 Lösche Project Payment Schedules...");
    await prisma.projectPaymentSchedule.deleteMany({});
    
    console.log("  📋 Lösche Project Expenses...");
    await prisma.projectExpense.deleteMany({});
    
    console.log("  📋 Lösche Projects...");
    await prisma.project.deleteMany({});
    
    console.log("  📋 Lösche Contacts...");
    await prisma.contact.deleteMany({});
    
    console.log("  📋 Lösche Companies...");
    await prisma.company.deleteMany({});
    
    console.log("  📋 Lösche Units...");
    await prisma.unit.deleteMany({});
    
    console.log("  📋 Lösche Tags...");
    await prisma.tag.deleteMany({});
    
    console.log("  📋 Lösche Users...");
    await prisma.user.deleteMany({});
    
    console.log("  📋 Lösche Sync State...");
    await prisma.syncState.deleteMany({});
    
    // WICHTIG: DashboardUser werden NICHT gelöscht!
    console.log("  ✅ DashboardUser bleiben erhalten (lokale Benutzer)");
    
    console.log("\n✅ Alle MOCO-Daten wurden erfolgreich gelöscht!");
    console.log("📝 Nächste Schritte:");
    console.log("   1. Aktualisiere worker/.env mit neuen MOCO-Credentials");
    console.log("   2. Starte Worker neu: docker compose restart worker");
    console.log("   3. Der automatische Sync lädt die neuen Daten");
    
  } catch (error: any) {
    console.error("❌ Fehler beim Zurücksetzen:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetMocoData();

