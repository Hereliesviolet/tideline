// src/jobs/syncCore.ts
// Robuste, schlanke Sync-Routinen ohne fehlerhafte Map.get(key, default)-Aufrufe.
// Einträge ohne userId werden konsequent übersprungen, damit Prisma-Typen passen.

import { prisma } from "../db";
import { MocoClient, type Activity as MocoActivity, type PlanningEntry as MocoPlanningEntry, type Project as MocoProject, type User as MocoUser, type Schedule as MocoSchedule, type Company as MocoCompany, type Task as MocoTask, type UserHoliday as MocoUserHoliday, type Employment as MocoEmployment, type Tag as MocoTag, type Contact as MocoContact, type UserPresence as MocoUserPresence, type WorkTimeAdjustment as MocoWorkTimeAdjustment, type ProjectGroup as MocoProjectGroup, type Unit as MocoUnit } from "../lib/mocoClient";
import { MOCO_BASE, MOCO_TOKEN } from "../env";

// Zeitfenster Full-Sync: 3 Monate zurück für Activities/Schedules, 2 Monate voraus für Planning/Schedules
const FULL_SYNC_PAST_MONTHS = 3;
const FULL_SYNC_FUTURE_MONTHS = 2;

const SYNC_LOG_PREFIX = "[sync]";

type RawActivity = {
  id: number;
  date: string | Date;
  seconds?: number | null;
  hours?: number | null;
  workedSeconds?: number | null;
  billable?: boolean | null;
  description?: string | null;
  userId?: number | null;
  projectId?: number | null;
  taskId?: number | null;
  updatedAt?: string | Date | null;
};

type RawPlanning = {
  id: number;
  startsOn: string | Date;
  endsOn: string | Date;
  hoursPerDay: number;
  tentative?: boolean | null;
  color?: string | null;
  userId?: number | null;
  projectId?: number | null;
  taskId?: number | null;
  updatedAt?: string | Date | null;
};

type RawUser = {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  title?: string | null;
  avatar?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  office?: string | null;
  unitId?: number | null;
  unitName?: string | null;
  archived?: boolean | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawProject = {
  id: number;
  identifier?: string | null;
  name: string;
  customerId?: number | null;
  customerName?: string | null;
  leaderId?: number | null;
  leaderName?: string | null;
  color?: string | null;
  billable?: boolean | null;
  internal?: boolean | null;
  budget?: number | null;
  budgetSpent?: number | null;
  currency?: string | null;
  startDate?: string | Date | null;
  finishDate?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawSchedule = {
  id: number;
  date: string | Date;
  absenceCode: string;
  am?: boolean | null;
  pm?: boolean | null;
  userId?: number | null;
  updatedAt?: string | Date | null;
};

type RawCompany = {
  id: number;
  name: string;
  type?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  archived?: boolean | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawTask = {
  id: number;
  name: string;
  projectId?: number | null;
  billable?: boolean | null;
  active?: boolean | null;
  budget?: number | null;
  budgetSpent?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawUserHoliday = {
  id: number;
  year: number;
  total?: number | null;
  used?: number | null;
  remaining?: number | null;
  userId?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawEmployment = {
  id: number;
  userId?: number | null;
  weeklyTargetHours?: number | null;
  patternAm?: number[] | null;
  patternPm?: number[] | null;
  fromDate: string | Date;
  toDate?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawTag = {
  id: number;
  name: string;
  color?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawContact = {
  id: number;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  companyId?: number | null;
  archived?: boolean | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawUserPresence = {
  id: number;
  date: string | Date;
  from?: string | null;
  to?: string | null;
  userId?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawWorkTimeAdjustment = {
  id: number;
  date: string | Date;
  hours?: number | null;
  comment?: string | null;
  userId?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawProjectExpense = {
  id: number;
  date: string | Date;
  description?: string | null;
  gross?: number | null;
  net?: number | null;
  vat?: number | null;
  currency?: string | null;
  billable?: boolean | null;
  projectId?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawProjectPaymentSchedule = {
  id: number;
  invoiceDate?: string | Date | null;
  dueDate?: string | Date | null;
  net?: number | null;
  gross?: number | null;
  currency?: string | null;
  projectId?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawProjectGroup = {
  id: number;
  name: string;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawProjectContract = {
  id: number;
  name?: string | null;
  projectId?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type RawUnit = {
  id: number;
  name: string;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

// Globaler Mutex: verhindert parallele Sync-Ausführungen (Full und Frequent gemeinsam)
let syncLock = false;

// kleine Helper
const toDate = (v: string | Date | null | undefined): Date =>
  v instanceof Date ? v : new Date(v ?? Date.now());

const toISODate = (d: Date): string => {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// MOCO erwartet das Format ohne Millisekunden: "2020-01-23T07:29:56Z"
const toISODateTime = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

type SyncWindow = {
  pastDays?: number;
  futureDays?: number;
};

function mergeById<T extends { id: number }>(...lists: T[][]): T[] {
  const map = new Map<number, T>();
  for (const list of lists) {
    for (const item of list) {
      if (!item || typeof item.id !== "number") continue;
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

async function ensureUsersExist(ids: (number | null | undefined)[]): Promise<void> {
  const unique = Array.from(
    new Set(ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id)))
  );
  if (!unique.length) return;
  const existing = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const current = new Set(existing.map((u) => u.id));
  const missing = unique.filter((id) => !current.has(id));
  if (!missing.length) return;
  await prisma.user.createMany({
    data: missing.map((id) => ({
      id,
      firstname: null,
      lastname: null,
      email: null,
      title: null,
      avatar: null,
      phone: null,
      mobilePhone: null,
      office: null,
      unitId: null,
      unitName: null,
      archived: true,
      updatedAt: new Date(),
    })),
    skipDuplicates: true,
  });
}

async function ensureCompaniesExist(ids: (number | null | undefined)[]): Promise<void> {
  const unique = Array.from(
    new Set(ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id)))
  );
  if (!unique.length) return;
  const existing = await prisma.company.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const current = new Set(existing.map((c) => c.id));
  const missing = unique.filter((id) => !current.has(id));
  if (!missing.length) return;
  await prisma.company.createMany({
    data: missing.map((id) => ({
      id,
      name: `Company ${id}`,
      type: null,
      website: null,
      phone: null,
      email: null,
      address: null,
      archived: true,
      updatedAt: new Date(),
    })),
    skipDuplicates: true,
  });
}

async function ensureProjectsExist(ids: (number | null | undefined)[]): Promise<void> {
  const unique = Array.from(
    new Set(ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id)))
  );
  if (!unique.length) return;
  const existing = await prisma.project.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const current = new Set(existing.map((p) => p.id));
  const missing = unique.filter((id) => !current.has(id));
  if (!missing.length) return;
  await prisma.project.createMany({
    data: missing.map((id) => ({
      id,
      identifier: null,
      name: `Projekt ${id}`,
      customerId: null,
      customerName: null,
      leaderId: null,
      leaderName: null,
      color: null,
      billable: null,
      internal: null,
      budget: null,
      budgetSpent: null,
      currency: null,
      startDate: null,
      finishDate: null,
      updatedAt: new Date(),
    })),
    skipDuplicates: true,
  });
}

/**
 * Schreibt Activities in die DB. Nur Einträge mit vorhandener userId.
 * Verwendet Batch-Verarbeitung für bessere Performance.
 */
export async function upsertActivities(
  raw: RawActivity[],
  window: { from: Date; to: Date },
  prune = false
): Promise<void> {
  const cleaned = raw
    .map((a) => {
      const seconds =
        typeof a.seconds === "number"
          ? a.seconds
          : typeof a.hours === "number"
          ? Math.round(a.hours * 3600)
          : null;

      return {
        id: Number(a.id),
        date: toDate(a.date),
        seconds,
        hours: typeof a.hours === "number" ? a.hours : seconds !== null ? seconds / 3600 : null,
        workedSeconds: a.workedSeconds ?? null,
        billable: a.billable ?? null,
        description: a.description 
          ? a.description.substring(0, 200).trim() 
          : null,
        userId: typeof a.userId === "number" ? a.userId : null,
        projectId: a.projectId ?? null,
        taskId: a.taskId ?? null,
        updatedAt: toDate(a.updatedAt ?? new Date()),
      };
    })
    .filter((a) => a.userId !== null); // <-- ohne userId NICHT schreiben

  if (cleaned.length === 0) {
    console.log(`${SYNC_LOG_PREFIX} No activities to upsert`);
    return;
  }

  await ensureUsersExist(cleaned.map((a) => a.userId));
  await ensureProjectsExist(cleaned.map((a) => a.projectId));

  // Batch-Verarbeitung: Chunking (1000 pro Batch für bessere Performance)
  const BATCH_SIZE = 1000;
  const chunks: typeof cleaned[] = [];
  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    chunks.push(cleaned.slice(i, i + BATCH_SIZE));
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    
    await prisma.$transaction(async (tx) => {
      // Bestehende IDs abfragen
      const existingIds = await tx.activity.findMany({
        where: { id: { in: chunk.map((a) => a.id) } },
        select: { id: true },
      });
      const existingIdSet = new Set(existingIds.map((e) => e.id));

      const toCreate = chunk.filter((a) => !existingIdSet.has(a.id));
      const toUpdate = chunk.filter((a) => existingIdSet.has(a.id));

      // Batch-Insert (nur Einträge mit userId !== null)
      const toCreateValid = toCreate.filter((a): a is typeof a & { userId: number } => a.userId !== null);
      if (toCreateValid.length > 0) {
        await tx.activity.createMany({
          data: toCreateValid.map((a) => ({
            id: a.id,
        date: a.date,
        seconds: a.seconds,
        hours: a.hours,
        workedSeconds: a.workedSeconds,
        billable: a.billable,
        description: a.description,
            userId: a.userId,
        projectId: a.projectId,
        taskId: a.taskId,
        updatedAt: a.updatedAt,
          })),
          skipDuplicates: true,
        });
        createdCount += toCreateValid.length;
      }

      // Batch-Update (nur Einträge mit userId !== null)
      const toUpdateValid = toUpdate.filter((a): a is typeof a & { userId: number } => a.userId !== null);
      for (const a of toUpdateValid) {
        await tx.activity.update({
          where: { id: a.id },
          data: {
        date: a.date,
        seconds: a.seconds,
        hours: a.hours,
        workedSeconds: a.workedSeconds,
        billable: a.billable,
        description: a.description,
            userId: a.userId,
        projectId: a.projectId,
        taskId: a.taskId,
        updatedAt: a.updatedAt,
      },
    });
        updatedCount++;
      }
    });

    if ((chunkIndex + 1) % 10 === 0 || chunkIndex === chunks.length - 1) {
      console.log(`${SYNC_LOG_PREFIX} Processed ${chunkIndex + 1}/${chunks.length} activity batches...`);
    }
  }

  console.log(`${SYNC_LOG_PREFIX} Activities: ${createdCount} created, ${updatedCount} updated`);

  // Nur beim Full-Sync: in MOCO gelöschte Buchungen kommen per updated_after nie zurück,
  // daher alles im Fenster löschen, was MOCO nicht mehr geliefert hat.
  if (prune) {
    const pruned = await prisma.activity.deleteMany({
      where: {
        date: { gte: window.from, lte: window.to },
        id: { notIn: cleaned.map((a) => a.id) },
      },
    });
    if (pruned.count > 0) {
      console.log(`${SYNC_LOG_PREFIX} Pruned ${pruned.count} stale activities (deleted in MOCO but lingering in DB)`);
    }
  }

  // Alte Daten löschen: Älter als 1 Jahr vom aktuellen Datum
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  oneYearAgo.setHours(0, 0, 0, 0);
  
  const deletedOld = await prisma.activity.deleteMany({
    where: {
      date: { lt: oneYearAgo },
    },
  });

  // Daten außerhalb des Zeitfensters (nach dem aktuellen Jahr) löschen
  const deletedAfter = await prisma.activity.deleteMany({
    where: {
      date: { gt: window.to },
    },
  });

  if (deletedOld.count > 0 || deletedAfter.count > 0) {
    console.log(`${SYNC_LOG_PREFIX} Cleaned up ${deletedOld.count + deletedAfter.count} old activities (${deletedOld.count} older than 1 year, ${deletedAfter.count} after time window)`);
  }
}

export async function upsertUsers(raw: RawUser[]): Promise<void> {
  const cleaned = raw
    .map((u) => ({
      id: Number(u.id),
      firstname: u.firstname ?? null,
      lastname: u.lastname ?? null,
      email: u.email ?? null,
      title: u.title ?? null,
      avatar: u.avatar ?? null,
      phone: u.phone ?? null,
      mobilePhone: u.mobilePhone ?? null,
      office: u.office ?? null,
      unitId: u.unitId ?? null,
      unitName: u.unitName ?? null,
      archived: u.archived ?? false,
      createdAt: u.createdAt ? toDate(u.createdAt) : null,
      updatedAt: toDate(u.updatedAt ?? new Date()),
    }))
    .filter((u) => Number.isFinite(u.id));

  for (const u of cleaned) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        firstname: u.firstname,
        lastname: u.lastname,
        email: u.email,
        title: u.title,
        avatar: u.avatar,
        phone: u.phone,
        mobilePhone: u.mobilePhone,
        office: u.office,
        unitId: u.unitId,
        unitName: u.unitName,
        archived: u.archived,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
      create: {
        id: u.id,
        firstname: u.firstname,
        lastname: u.lastname,
        email: u.email,
        title: u.title,
        avatar: u.avatar,
        phone: u.phone,
        mobilePhone: u.mobilePhone,
        office: u.office,
        unitId: u.unitId,
        unitName: u.unitName,
        archived: u.archived,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
    });
  }
}

export async function upsertProjects(raw: RawProject[]): Promise<void> {
  const cleaned = raw
    .map((p) => ({
      id: Number(p.id),
      identifier: p.identifier ?? null,
      name: p.name,
      customerId: p.customerId ?? null,
      customerName: p.customerName ?? null,
      leaderId: p.leaderId ?? null,
      leaderName: p.leaderName ?? null,
      color: p.color ?? null,
      billable: p.billable ?? null,
      internal: p.internal ?? null,
      budget: p.budget ?? null,
      budgetSpent: p.budgetSpent ?? null,
      currency: p.currency ?? null,
      startDate: p.startDate ? toDate(p.startDate) : null,
      finishDate: p.finishDate ? toDate(p.finishDate) : null,
      createdAt: p.createdAt ? toDate(p.createdAt) : null,
      updatedAt: toDate(p.updatedAt ?? new Date()),
    }))
    .filter((p) => Number.isFinite(p.id) && p.name);

  for (const p of cleaned) {
    await prisma.project.upsert({
      where: { id: p.id },
      update: {
        identifier: p.identifier,
        name: p.name,
        customerId: p.customerId,
        customerName: p.customerName,
        leaderId: p.leaderId,
        leaderName: p.leaderName,
        color: p.color,
        billable: p.billable,
        internal: p.internal,
        budget: p.budget,
        budgetSpent: p.budgetSpent,
        currency: p.currency,
        startDate: p.startDate,
        finishDate: p.finishDate,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      create: {
        id: p.id,
        identifier: p.identifier,
        name: p.name,
        customerId: p.customerId,
        customerName: p.customerName,
        leaderId: p.leaderId,
        leaderName: p.leaderName,
        color: p.color,
        billable: p.billable,
        internal: p.internal,
        budget: p.budget,
        budgetSpent: p.budgetSpent,
        currency: p.currency,
        startDate: p.startDate,
        finishDate: p.finishDate,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
    });
  }
}

/**
 * Schreibt Schedules (Abwesenheiten) in die DB. Nur Einträge mit vorhandener userId.
 */
/**
 * Schreibt Schedules in die DB. Nur Einträge mit vorhandener userId.
 * Verwendet Batch-Verarbeitung für bessere Performance.
 */
export async function upsertSchedules(
  raw: RawSchedule[],
  window: { from: Date; to: Date },
  prune = false
): Promise<void> {
  // DEBUG: Log vor dem Cleaning
  const beforeCleaning = raw.length;
  const withUserIdBefore = raw.filter(s => s.userId !== null).length;
  const withAbsenceCodeBefore = raw.filter(s => (s.absenceCode ?? "").trim().length > 0).length;
  
  const cleaned = raw
    .map((s) => ({
      id: Number(s.id),
      date: toDate(s.date),
      absenceCode: String(s.absenceCode ?? "").trim(),
      am: s.am ?? null,
      pm: s.pm ?? null,
      userId: typeof s.userId === "number" ? s.userId : null,
      updatedAt: toDate(s.updatedAt ?? new Date()),
    }))
    .filter((s) => s.userId !== null && s.absenceCode.length > 0); // <-- ohne userId oder absenceCode NICHT schreiben

  // DEBUG: Log nach dem Cleaning
  const afterCleaning = cleaned.length;
  const filteredOut = beforeCleaning - afterCleaning;
  
  if (cleaned.length === 0) {
    console.log(`${SYNC_LOG_PREFIX} No schedules to upsert (${beforeCleaning} total, ${withUserIdBefore} with userId, ${withAbsenceCodeBefore} with absenceCode, ${filteredOut} filtered out)`);
    
    // DEBUG: Zeige Beispiel-Schedules die herausgefiltert wurden
    if (raw.length > 0) {
      const sample = raw.slice(0, 3).map(s => ({
        id: s.id,
        userId: s.userId,
        absenceCode: s.absenceCode,
        hasUserId: s.userId !== null,
        hasAbsenceCode: (s.absenceCode ?? "").trim().length > 0
      }));
      console.log(`${SYNC_LOG_PREFIX} Sample filtered schedules:`, JSON.stringify(sample, null, 2));
    }
    return;
  }
  
  console.log(`${SYNC_LOG_PREFIX} Upserting ${cleaned.length} schedules (${filteredOut} filtered out)`);

  await ensureUsersExist(cleaned.map((s) => s.userId));

  // Batch-Verarbeitung: Chunking (1000 pro Batch für bessere Performance)
  const BATCH_SIZE = 1000;
  const chunks: typeof cleaned[] = [];
  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    chunks.push(cleaned.slice(i, i + BATCH_SIZE));
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    
    await prisma.$transaction(async (tx) => {
      // Bestehende IDs abfragen
      const existingIds = await tx.schedule.findMany({
        where: { id: { in: chunk.map((s) => s.id) } },
        select: { id: true },
      });
      const existingIdSet = new Set(existingIds.map((e) => e.id));

      const toCreate = chunk.filter((s) => !existingIdSet.has(s.id));
      const toUpdate = chunk.filter((s) => existingIdSet.has(s.id));

      // Batch-Insert (nur Einträge mit userId !== null)
      const toCreateValid = toCreate.filter((s): s is typeof s & { userId: number } => s.userId !== null);
      if (toCreateValid.length > 0) {
        // MOCO vergibt beim Bearbeiten einer Abwesenheit eine neue Schedule-ID. Die alte Zeile
        // blockiert sonst über @@unique([userId, date, absenceCode]) den Insert (skipDuplicates
        // würde den neuen Eintrag still verwerfen) – daher zuerst die Alt-ID entfernen.
        await tx.schedule.deleteMany({
          where: {
            OR: toCreateValid.map((s) => ({
              userId: s.userId,
              date: s.date,
              absenceCode: s.absenceCode,
              NOT: { id: s.id },
            })),
          },
        });
        await tx.schedule.createMany({
          data: toCreateValid.map((s) => ({
            id: s.id,
            date: s.date,
            absenceCode: s.absenceCode,
            am: s.am,
            pm: s.pm,
            userId: s.userId,
            updatedAt: s.updatedAt,
          })),
          skipDuplicates: true,
        });
        createdCount += toCreateValid.length;
      }

      // Batch-Update (nur Einträge mit userId !== null)
      const toUpdateValid = toUpdate.filter((s): s is typeof s & { userId: number } => s.userId !== null);
      for (const s of toUpdateValid) {
        await tx.schedule.update({
          where: { id: s.id },
          data: {
            date: s.date,
            absenceCode: s.absenceCode,
            am: s.am,
            pm: s.pm,
            userId: s.userId,
            updatedAt: s.updatedAt,
          },
        });
        updatedCount++;
      }
    });

    if ((chunkIndex + 1) % 10 === 0 || chunkIndex === chunks.length - 1) {
      console.log(`${SYNC_LOG_PREFIX} Processed ${chunkIndex + 1}/${chunks.length} schedule batches...`);
    }
  }

  console.log(`${SYNC_LOG_PREFIX} Schedules: ${createdCount} created, ${updatedCount} updated`);

  if (prune) {
    const pruned = await prisma.schedule.deleteMany({
      where: {
        date: { gte: window.from, lte: window.to },
        id: { notIn: cleaned.map((s) => s.id) },
      },
    });
    if (pruned.count > 0) {
      console.log(`${SYNC_LOG_PREFIX} Pruned ${pruned.count} stale schedules (deleted in MOCO but lingering in DB)`);
    }
  }

  // Alte Daten löschen: Älter als 1 Jahr vom aktuellen Datum
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  oneYearAgo.setHours(0, 0, 0, 0);
  
  const deletedOld = await prisma.schedule.deleteMany({
    where: {
      date: { lt: oneYearAgo },
    },
  });

  // Daten außerhalb des Zeitfensters (nach dem aktuellen Jahr) löschen
  const deletedAfter = await prisma.schedule.deleteMany({
    where: {
      date: { gt: window.to },
    },
  });

  if (deletedOld.count > 0 || deletedAfter.count > 0) {
    console.log(`${SYNC_LOG_PREFIX} Cleaned up ${deletedOld.count + deletedAfter.count} old schedules (${deletedOld.count} older than 1 year, ${deletedAfter.count} after time window)`);
  }
}

/**
 * Schreibt PlanningEntries in die DB. Nur Einträge mit vorhandener userId.
 *
 * WICHTIG: Wenn `window` übergeben wird, werden zusätzlich alle PlanningEntries,
 * die mit diesem Zeitraum überlappen, aber NICHT mehr von MOCO geliefert werden,
 * aus der DB gelöscht. Damit verschwinden in MOCO gelöschte/umgeplante Einträge
 * auch im Dashboard (bisher blieben sie als „Geister-Einträge" stehen).
 */
export async function upsertPlanning(
  raw: RawPlanning[],
  window?: { from: Date; to: Date }
): Promise<void> {
  const cleaned = raw
    .map((p) => ({
      id: Number(p.id),
      startsOn: toDate(p.startsOn),
      endsOn: toDate(p.endsOn),
      hoursPerDay: Number(p.hoursPerDay ?? 0),
      tentative: p.tentative ?? null,
      color: p.color ?? null,
      userId: typeof p.userId === "number" ? p.userId : null,
      projectId: p.projectId ?? null,
      taskId: p.taskId ?? null,
      updatedAt: toDate(p.updatedAt ?? new Date()),
    }))
    .filter((p) => p.userId !== null); // <-- ohne userId NICHT schreiben

  await ensureUsersExist(cleaned.map((p) => p.userId));
  await ensureProjectsExist(cleaned.map((p) => p.projectId));

  for (const p of cleaned) {
    await prisma.planningEntry.upsert({
      where: { id: p.id },
      update: {
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        hoursPerDay: p.hoursPerDay,
        tentative: p.tentative,
        color: p.color,
        userId: p.userId!, // safe
        projectId: p.projectId,
        taskId: p.taskId,
        updatedAt: p.updatedAt,
      },
      create: {
        id: p.id,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        hoursPerDay: p.hoursPerDay,
        tentative: p.tentative,
        color: p.color,
        userId: p.userId!, // safe
        projectId: p.projectId,
        taskId: p.taskId,
        updatedAt: p.updatedAt,
      },
    });
  }

  console.log(`${SYNC_LOG_PREFIX} PlanningEntries: ${cleaned.length} upserted`);

  // GEISTER-EINTRÄGE PRUNEN:
  // Alle DB-Einträge im Sync-Window, die NICHT mehr in MOCO existieren, löschen.
  // Überlappung mit dem Window: endsOn >= window.from AND startsOn <= window.to.
  if (window) {
    const liveIds = cleaned.map((p) => p.id);
    const pruned = await prisma.planningEntry.deleteMany({
      where: {
        AND: [
          { endsOn: { gte: window.from } },
          { startsOn: { lte: window.to } },
          liveIds.length > 0
            ? { id: { notIn: liveIds } }
            : {}, // Wenn MOCO leer war, alle im Window löschen
        ],
      },
    });
    if (pruned.count > 0) {
      console.log(
        `${SYNC_LOG_PREFIX} Pruned ${pruned.count} stale planning entries (deleted in MOCO but lingering in DB)`
      );
    }
  }

  // Alte Planning Entries löschen: Älter als 1 Jahr vom aktuellen Datum
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  oneYearAgo.setHours(0, 0, 0, 0);

  const deletedOld = await prisma.planningEntry.deleteMany({
    where: {
      endsOn: { lt: oneYearAgo }, // Planning Entries, die vor mehr als 1 Jahr endeten
    },
  });

  if (deletedOld.count > 0) {
    console.log(`${SYNC_LOG_PREFIX} Cleaned up ${deletedOld.count} old planning entries (older than 1 year)`);
  }
}


function computeActivitiesWindow(): { from: Date; to: Date; fromISO: string; toISO: string } {
  // Activities: letzte 3 Monate bis +1 Monat. Das Fenster muss über "heute" hinausgehen,
  // weil Mitarbeiter Zeiten für Folgetage vorab buchen; endet es bei heute, fällt so ein
  // Eintrag beim Sync aus dem Datumsfilter und wird wegen updated_after nie wieder geholt.
  const today = new Date();

  const from = new Date(today);
  from.setMonth(from.getMonth() - FULL_SYNC_PAST_MONTHS);
  from.setHours(0, 0, 0, 0);

  const to = new Date(today);
  to.setMonth(to.getMonth() + 1);
  to.setHours(23, 59, 59, 999);

  return { from, to, fromISO: toISODate(from), toISO: toISODate(to) };
}

function computeSchedulesWindow(): { from: Date; to: Date; fromISO: string; toISO: string } {
  // Schedules/Abwesenheiten Full-Sync: letzte 3 Monate bis +2 Monate
  const today = new Date();

  const from = new Date(today);
  from.setMonth(from.getMonth() - FULL_SYNC_PAST_MONTHS);
  from.setHours(0, 0, 0, 0);

  const to = new Date(today);
  to.setMonth(to.getMonth() + FULL_SYNC_FUTURE_MONTHS);
  to.setHours(23, 59, 59, 999);

  return { from, to, fromISO: toISODate(from), toISO: toISODate(to) };
}

function computePlanningWindow(): { from: Date; to: Date; fromISO: string; toISO: string } {
  // Planning Full-Sync: letzte 3 Monate (für IST vs. PLAN) bis +2 Monate
  const today = new Date();

  const from = new Date(today);
  from.setMonth(from.getMonth() - FULL_SYNC_PAST_MONTHS);
  from.setHours(0, 0, 0, 0);

  const to = new Date(today);
  to.setMonth(to.getMonth() + FULL_SYNC_FUTURE_MONTHS);
  to.setHours(23, 59, 59, 999);

  return { from, to, fromISO: toISODate(from), toISO: toISODate(to) };
}

async function getSyncStateTime(resource: string): Promise<Date | null> {
  try {
    const state = await prisma.syncState.findUnique({ where: { resource } });
    return state?.cursor ?? null;
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} Failed to get syncState "${resource}":`, e);
    return null;
  }
}

async function setSyncStateTime(resource: string, date: Date): Promise<void> {
  try {
    await prisma.syncState.upsert({
      where: { resource },
      create: { resource, cursor: date },
      update: { cursor: date },
    });
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} Failed to set syncState "${resource}":`, e);
  }
}

async function getLastFrequentSyncTime(): Promise<Date | null> {
  return getSyncStateTime("frequent_sync_last_run");
}

async function setLastFrequentSyncTime(date: Date): Promise<void> {
  return setSyncStateTime("frequent_sync_last_run", date);
}

async function getLastFullSyncTime(): Promise<Date | null> {
  return getSyncStateTime("full_sync_last_run");
}

async function setLastFullSyncTime(date: Date): Promise<void> {
  return setSyncStateTime("full_sync_last_run", date);
}

// Legacy-Alias für bestehende DB-Einträge
async function getLastActivitiesSyncTime(): Promise<Date | null> {
  // Schaue zuerst im neuen Key, dann Legacy-Fallback
  const t = await getSyncStateTime("frequent_sync_last_run");
  if (t) return t;
  return getSyncStateTime("activities_last_sync");
}

function ensureClient(): MocoClient | null {
  if (!MOCO_BASE || !MOCO_TOKEN) {
    console.warn(
      `${SYNC_LOG_PREFIX} MOCO credentials missing (MOCO_BASE_URL / MOCO_API_KEY) – skipping sync.`
    );
    return null;
  }
  return new MocoClient({ baseUrl: MOCO_BASE, apiToken: MOCO_TOKEN });
}

async function upsertCompanies(raw: RawCompany[]): Promise<void> {
  for (const c of raw) {
    await prisma.company.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        type: c.type ?? null,
        website: c.website ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        address: c.address ?? null,
        archived: c.archived ?? false,
        createdAt: toDate(c.createdAt),
        updatedAt: toDate(c.updatedAt ?? new Date()),
      },
      create: {
        id: c.id,
        name: c.name,
        type: c.type ?? null,
        website: c.website ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        address: c.address ?? null,
        archived: c.archived ?? false,
        createdAt: toDate(c.createdAt),
        updatedAt: toDate(c.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertTasks(raw: RawTask[]): Promise<void> {
  await ensureProjectsExist(raw.map((t) => t.projectId));
  for (const t of raw) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        projectId: t.projectId ?? null,
        billable: t.billable ?? null,
        active: t.active ?? true,
        budget: t.budget ?? null,
        budgetSpent: t.budgetSpent ?? null,
        createdAt: toDate(t.createdAt),
        updatedAt: toDate(t.updatedAt ?? new Date()),
      },
      create: {
        id: t.id,
        name: t.name,
        projectId: t.projectId ?? null,
        billable: t.billable ?? null,
        active: t.active ?? true,
        budget: t.budget ?? null,
        budgetSpent: t.budgetSpent ?? null,
        createdAt: toDate(t.createdAt),
        updatedAt: toDate(t.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertUserHolidays(raw: RawUserHoliday[]): Promise<void> {
  const cleaned = raw.filter((h) => h.userId !== null);
  await ensureUsersExist(cleaned.map((h) => h.userId));
  for (const h of cleaned) {
    await prisma.userHoliday.upsert({
      where: { id: h.id },
      update: {
        year: h.year,
        total: h.total ?? null,
        used: h.used ?? null,
        remaining: h.remaining ?? null,
        userId: h.userId!,
        createdAt: toDate(h.createdAt),
        updatedAt: toDate(h.updatedAt ?? new Date()),
      },
      create: {
        id: h.id,
        year: h.year,
        total: h.total ?? null,
        used: h.used ?? null,
        remaining: h.remaining ?? null,
        userId: h.userId!,
        createdAt: toDate(h.createdAt),
        updatedAt: toDate(h.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertEmployments(raw: RawEmployment[]): Promise<void> {
  const cleaned = raw.filter((e) => e.userId !== null);
  await ensureUsersExist(cleaned.map((e) => e.userId));
  for (const e of cleaned) {
    await prisma.employment.upsert({
      where: { id: e.id },
      update: {
        userId: e.userId!,
        weeklyTargetHours: e.weeklyTargetHours ?? null,
        patternAm: e.patternAm ? JSON.stringify(e.patternAm) : null,
        patternPm: e.patternPm ? JSON.stringify(e.patternPm) : null,
        fromDate: toDate(e.fromDate),
        toDate: e.toDate ? toDate(e.toDate) : null,
        createdAt: toDate(e.createdAt),
        updatedAt: toDate(e.updatedAt ?? new Date()),
      },
      create: {
        id: e.id,
        userId: e.userId!,
        weeklyTargetHours: e.weeklyTargetHours ?? null,
        patternAm: e.patternAm ? JSON.stringify(e.patternAm) : null,
        patternPm: e.patternPm ? JSON.stringify(e.patternPm) : null,
        fromDate: toDate(e.fromDate),
        toDate: e.toDate ? toDate(e.toDate) : null,
        createdAt: toDate(e.createdAt),
        updatedAt: toDate(e.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertTags(raw: RawTag[]): Promise<void> {
  for (const t of raw) {
    await prisma.tag.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        color: t.color ?? null,
        createdAt: toDate(t.createdAt),
        updatedAt: toDate(t.updatedAt ?? new Date()),
      },
      create: {
        id: t.id,
        name: t.name,
        color: t.color ?? null,
        createdAt: toDate(t.createdAt),
        updatedAt: toDate(t.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertContacts(raw: RawContact[]): Promise<void> {
  await ensureCompaniesExist(raw.map((c) => c.companyId));
  for (const c of raw) {
    await prisma.contact.upsert({
      where: { id: c.id },
      update: {
        firstname: c.firstname ?? null,
        lastname: c.lastname ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        mobilePhone: c.mobilePhone ?? null,
        companyId: c.companyId ?? null,
        archived: c.archived ?? false,
        createdAt: toDate(c.createdAt),
        updatedAt: toDate(c.updatedAt ?? new Date()),
      },
      create: {
        id: c.id,
        firstname: c.firstname ?? null,
        lastname: c.lastname ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        mobilePhone: c.mobilePhone ?? null,
        companyId: c.companyId ?? null,
        archived: c.archived ?? false,
        createdAt: toDate(c.createdAt),
        updatedAt: toDate(c.updatedAt ?? new Date()),
      },
    });
  }
}

/**
 * Schreibt UserPresences in die DB. Nur Einträge mit vorhandener userId.
 * Verwendet Batch-Verarbeitung für bessere Performance.
 */
async function upsertUserPresences(raw: RawUserPresence[], window: { from: Date; to: Date }): Promise<void> {
  const cleaned = raw
    .map((p) => ({
      id: Number(p.id),
      date: toDate(p.date),
      from: p.from ?? null,
      to: p.to ?? null,
      userId: typeof p.userId === "number" ? p.userId : null,
      createdAt: p.createdAt ? toDate(p.createdAt) : null,
      updatedAt: toDate(p.updatedAt ?? new Date()),
    }))
    .filter((p): p is typeof p & { userId: number } => p.userId !== null);

  if (cleaned.length === 0) {
    console.log(`${SYNC_LOG_PREFIX} No user presences to upsert`);
    return;
  }

  await ensureUsersExist(cleaned.map((p) => p.userId));

  // Batch-Verarbeitung: Chunking (1000 pro Batch für bessere Performance)
  const BATCH_SIZE = 1000;
  const chunks: typeof cleaned[] = [];
  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    chunks.push(cleaned.slice(i, i + BATCH_SIZE));
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    
    await prisma.$transaction(async (tx) => {
      // Bestehende IDs abfragen
      const existingIds = await tx.userPresence.findMany({
        where: { id: { in: chunk.map((p) => p.id) } },
        select: { id: true },
      });
      const existingIdSet = new Set(existingIds.map((e) => e.id));

      const toCreate = chunk.filter((p) => !existingIdSet.has(p.id));
      const toUpdate = chunk.filter((p) => existingIdSet.has(p.id));

      // Batch-Insert (nur Einträge mit userId !== null)
      const toCreateValid = toCreate.filter((p): p is typeof p & { userId: number } => p.userId !== null);
      if (toCreateValid.length > 0) {
        await tx.userPresence.createMany({
          data: toCreateValid.map((p) => ({
            id: p.id,
            date: p.date,
            from: p.from,
            to: p.to,
            userId: p.userId,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          })),
          skipDuplicates: true,
        });
        createdCount += toCreateValid.length;
      }

      // Batch-Update (nur Einträge mit userId !== null)
      const toUpdateValid = toUpdate.filter((p): p is typeof p & { userId: number } => p.userId !== null);
      for (const p of toUpdateValid) {
        await tx.userPresence.update({
          where: { id: p.id },
          data: {
            date: p.date,
            from: p.from,
            to: p.to,
            userId: p.userId,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          },
        });
        updatedCount++;
      }
    });

    if ((chunkIndex + 1) % 10 === 0 || chunkIndex === chunks.length - 1) {
      console.log(`${SYNC_LOG_PREFIX} Processed ${chunkIndex + 1}/${chunks.length} user presence batches...`);
    }
  }

  console.log(`${SYNC_LOG_PREFIX} UserPresences: ${createdCount} created, ${updatedCount} updated`);

  // Alte Daten löschen: Älter als 1 Jahr vom aktuellen Datum
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  oneYearAgo.setHours(0, 0, 0, 0);
  
  const deletedOld = await prisma.userPresence.deleteMany({
    where: {
      date: { lt: oneYearAgo },
    },
  });

  // Daten außerhalb des Zeitfensters (nach dem aktuellen Jahr) löschen
  const deletedAfter = await prisma.userPresence.deleteMany({
    where: {
      date: { gt: window.to },
    },
  });

  if (deletedOld.count > 0 || deletedAfter.count > 0) {
    console.log(`${SYNC_LOG_PREFIX} Cleaned up ${deletedOld.count + deletedAfter.count} old user presences (${deletedOld.count} older than 1 year, ${deletedAfter.count} after time window)`);
  }
}

async function upsertWorkTimeAdjustments(raw: RawWorkTimeAdjustment[]): Promise<void> {
  const cleaned = raw.filter((w) => w.userId !== null);
  await ensureUsersExist(cleaned.map((w) => w.userId));
  for (const w of cleaned) {
    await prisma.workTimeAdjustment.upsert({
      where: { id: w.id },
      update: {
        date: toDate(w.date),
        hours: w.hours ?? null,
        comment: w.comment ?? null,
        userId: w.userId!,
        createdAt: toDate(w.createdAt),
        updatedAt: toDate(w.updatedAt ?? new Date()),
      },
      create: {
        id: w.id,
        date: toDate(w.date),
        hours: w.hours ?? null,
        comment: w.comment ?? null,
        userId: w.userId!,
        createdAt: toDate(w.createdAt),
        updatedAt: toDate(w.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertProjectExpenses(raw: RawProjectExpense[]): Promise<void> {
  await ensureProjectsExist(raw.map((e) => e.projectId));
  for (const e of raw) {
    await prisma.projectExpense.upsert({
      where: { id: e.id },
      update: {
        date: toDate(e.date),
        description: e.description ?? null,
        gross: e.gross ?? null,
        net: e.net ?? null,
        vat: e.vat ?? null,
        currency: e.currency ?? null,
        billable: e.billable ?? null,
        projectId: e.projectId ?? null,
        createdAt: toDate(e.createdAt),
        updatedAt: toDate(e.updatedAt ?? new Date()),
      },
      create: {
        id: e.id,
        date: toDate(e.date),
        description: e.description ?? null,
        gross: e.gross ?? null,
        net: e.net ?? null,
        vat: e.vat ?? null,
        currency: e.currency ?? null,
        billable: e.billable ?? null,
        projectId: e.projectId ?? null,
        createdAt: toDate(e.createdAt),
        updatedAt: toDate(e.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertProjectPaymentSchedules(raw: RawProjectPaymentSchedule[]): Promise<void> {
  await ensureProjectsExist(raw.map((p) => p.projectId));
  for (const p of raw) {
    await prisma.projectPaymentSchedule.upsert({
      where: { id: p.id },
      update: {
        invoiceDate: p.invoiceDate ? toDate(p.invoiceDate) : null,
        dueDate: p.dueDate ? toDate(p.dueDate) : null,
        net: p.net ?? null,
        gross: p.gross ?? null,
        currency: p.currency ?? null,
        projectId: p.projectId ?? null,
        createdAt: toDate(p.createdAt),
        updatedAt: toDate(p.updatedAt ?? new Date()),
      },
      create: {
        id: p.id,
        invoiceDate: p.invoiceDate ? toDate(p.invoiceDate) : null,
        dueDate: p.dueDate ? toDate(p.dueDate) : null,
        net: p.net ?? null,
        gross: p.gross ?? null,
        currency: p.currency ?? null,
        projectId: p.projectId ?? null,
        createdAt: toDate(p.createdAt),
        updatedAt: toDate(p.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertProjectGroups(raw: RawProjectGroup[]): Promise<void> {
  for (const g of raw) {
    await prisma.projectGroup.upsert({
      where: { id: g.id },
      update: {
        name: g.name,
        createdAt: toDate(g.createdAt),
        updatedAt: toDate(g.updatedAt ?? new Date()),
      },
      create: {
        id: g.id,
        name: g.name,
        createdAt: toDate(g.createdAt),
        updatedAt: toDate(g.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertProjectContracts(raw: RawProjectContract[]): Promise<void> {
  await ensureProjectsExist(raw.map((c) => c.projectId));
  for (const c of raw) {
    await prisma.projectContract.upsert({
      where: { id: c.id },
      update: {
        name: c.name ?? null,
        projectId: c.projectId ?? null,
        createdAt: toDate(c.createdAt),
        updatedAt: toDate(c.updatedAt ?? new Date()),
      },
      create: {
        id: c.id,
        name: c.name ?? null,
        projectId: c.projectId ?? null,
        createdAt: toDate(c.createdAt),
        updatedAt: toDate(c.updatedAt ?? new Date()),
      },
    });
  }
}

async function upsertUnits(raw: RawUnit[]): Promise<void> {
  for (const u of raw) {
    await prisma.unit.upsert({
      where: { id: u.id },
      update: {
        name: u.name,
        createdAt: toDate(u.createdAt),
        updatedAt: toDate(u.updatedAt ?? new Date()),
      },
      create: {
        id: u.id,
        name: u.name,
        createdAt: toDate(u.createdAt),
        updatedAt: toDate(u.updatedAt ?? new Date()),
      },
    });
  }
}

async function syncUsersAndProjects(client: MocoClient) {
  const [
    usersActive,
    usersArchived,
    projectsActive,
    projectsArchived,
    companiesActive,
    companiesArchived,
  ] = await Promise.all([
    client.users({ archived: false }).catch(() => []),
    client.users({ archived: true }).catch(() => []),
    client.projects({ archived: false }).catch(() => []),
    client.projects({ archived: true }).catch(() => []),
    client.companies({ archived: false }).catch(() => []),
    client.companies({ archived: true }).catch(() => []),
  ]);

  const users = mergeById<MocoUser>(usersActive, usersArchived);
  const projects = mergeById<MocoProject>(projectsActive, projectsArchived);
  const companies = mergeById<MocoCompany>(companiesActive, companiesArchived);

  await upsertCompanies(
    companies.map(
      (c): RawCompany => ({
        id: c.id,
        name: c.name,
        type: c.type ?? null,
        website: c.website ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        address: c.address ?? null,
        archived: c.archived ?? false,
        createdAt: c.created_at ?? null,
        updatedAt: c.updated_at ?? null,
      })
    )
  );

  // OPTIMIERUNG: Avatare parallel herunterladen und cachen
  const { downloadAndCacheAvatar, ensureAvatarsDir } = await import("../lib/avatarCache");
  await ensureAvatarsDir();
  
  // Avatare parallel herunterladen (nur für aktive User)
  const avatarPromises = users
    .filter(u => !u.archived && (u.avatar || u.avatar_url))
    .map(u => 
      downloadAndCacheAvatar(u.id, u.avatar ?? u.avatar_url ?? null)
        .catch(e => {
          console.warn(`[sync] Failed to cache avatar for user ${u.id}:`, e.message);
          return null;
        })
    );
  
  // Warte auf Avatar-Downloads (nicht blockierend für User-Upsert)
  Promise.all(avatarPromises).catch(e => {
    console.error("[sync] Avatar caching failed:", e);
  });

  await upsertUsers(
    users.map(
      (u): RawUser => ({
        id: u.id,
        firstname: u.firstname ?? null,
        lastname: u.lastname ?? null,
        email: u.email ?? null,
        title: u.title ?? null,
        avatar: u.avatar ?? u.avatar_url ?? null, // MOCO-URL bleibt in DB (für Fallback)
        phone: u.phone ?? null,
        mobilePhone: u.mobile_phone ?? null,
        office: u.office ?? null,
        unitId: u.unit?.id ?? u.unit_id ?? null,
        unitName: u.unit?.name ?? u.unit_name ?? null,
        archived: u.active === false, // MOCO "active: false" = DB "archived: true"
        createdAt: u.created_at ?? null,
        updatedAt: u.updated_at ?? null,
      })
    )
  );
  await upsertProjects(
    projects.map(
      (p): RawProject => ({
        id: p.id,
        identifier: p.identifier ?? p.number ?? null,
        name: p.name,
        customerId: p.customer?.id ?? p.customer_id ?? null,
        customerName: p.customer?.name ?? p.customer_name ?? null,
        leaderId: p.leader?.id ?? p.leader_id ?? null,
        leaderName: p.leader?.name ?? p.leader_name ?? null,
        color: p.color ?? null,
        billable: p.billable ?? null,
        internal: p.internal ?? null,
        budget: p.budget ?? null,
        budgetSpent: p.budget_spent ?? null,
        currency: p.currency ?? null,
        startDate: p.start_date ?? null,
        finishDate: p.finish_date ?? null,
        createdAt: p.created_at ?? null,
        updatedAt: p.updated_at ?? null,
      })
    )
  );
}

async function syncActivitiesAndSchedules(
  client: MocoClient,
  opts: { updatedAfter?: Date } = {}
) {
  const activitiesWindow = computeActivitiesWindow();
  const schedulesWindow = computeSchedulesWindow();
  const updatedAfterISO = opts.updatedAfter ? toISODateTime(opts.updatedAfter) : undefined;
  const mode = updatedAfterISO ? `incremental (after ${updatedAfterISO})` : "full";

  console.log(`${SYNC_LOG_PREFIX} Fetching activities ${activitiesWindow.fromISO}→${activitiesWindow.toISO} [${mode}]...`);

  const startTime = Date.now();

  console.log(`${SYNC_LOG_PREFIX} 📥 [1/3] Fetching activities...`);
  if (!updatedAfterISO) console.log(`${SYNC_LOG_PREFIX} ⏳ Full fetch – may take several minutes...`);
  const activitiesStart = Date.now();

  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - activitiesStart) / 1000);
    console.log(`${SYNC_LOG_PREFIX} ⏳ Still fetching activities... (${elapsed}s elapsed)`);
  }, 5000);

  let activities: any[] = [];
  let activitiesFetchFailed = false;
  try {
    activities = await client.activities({
      from: activitiesWindow.fromISO,
      to: activitiesWindow.toISO,
      updated_after: updatedAfterISO,
    });
    clearInterval(progressInterval);
    const activitiesTime = ((Date.now() - activitiesStart) / 1000).toFixed(1);
    console.log(`${SYNC_LOG_PREFIX} ✅ [1/3] Fetched ${activities.length} activities (${activitiesTime}s)`);
  } catch (e) {
    clearInterval(progressInterval);
    console.error(`${SYNC_LOG_PREFIX} ❌ Failed to fetch activities:`, e);
    activities = [];
    activitiesFetchFailed = true;
  }

  // Schedules und Presences parallel
  console.log(`${SYNC_LOG_PREFIX} 📥 [2/3] Fetching schedules...`);
  console.log(`${SYNC_LOG_PREFIX} 📥 [3/3] Fetching user presences...`);
  let schedulesFetchFailed = false;
  const [schedules, presences] = await Promise.all([
    client.schedules({
      from: schedulesWindow.fromISO,
      to: schedulesWindow.toISO,
      updated_after: updatedAfterISO,
    }).catch((e) => {
      console.error(`${SYNC_LOG_PREFIX} ❌ Failed to fetch schedules:`, e);
      schedulesFetchFailed = true;
      return [];
    }),
    client.userPresences({ from: schedulesWindow.fromISO, to: schedulesWindow.toISO }).catch(() => []),
  ]);
  
  const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${SYNC_LOG_PREFIX} ✅ [2/3] Fetched ${schedules.length} schedules`);
  console.log(`${SYNC_LOG_PREFIX} ✅ [3/3] Fetched ${presences.length} presences`);
  console.log(`${SYNC_LOG_PREFIX} ✅ Total fetch time: ${fetchTime}s`);

  const normalizedActivities: RawActivity[] = activities.map(
    (a: MocoActivity) => ({
      id: a.id,
      date: a.date,
      seconds: a.seconds ?? a.worked_seconds ?? null,
      hours: a.hours ?? null,
      workedSeconds: a.worked_seconds ?? null,
      billable: a.billable ?? null,
      description: a.description 
        ? a.description.substring(0, 200).trim() 
        : null,
      userId: a.user?.id ?? null,
      projectId: a.project?.id ?? null,
      taskId: a.task?.id ?? null,
      updatedAt: a.updated_at ?? null,
    })
  );

  const normalizedSchedules: RawSchedule[] = schedules.map(
    (s: MocoSchedule) => ({
      id: s.id,
      date: s.date,
      // WICHTIG: absence_code kann in assignment.code sein (neue API) oder direkt in absence_code (alte API)
      absenceCode: s.assignment?.code ?? s.absence_code ?? "",
      am: s.am ?? null,
      pm: s.pm ?? null,
      userId: s.user?.id ?? null,
      updatedAt: undefined, // Schedules haben kein updated_at in der API
    })
  );
  
  // DEBUG: Log Statistik über normalisierte Schedules
  const withUserId = normalizedSchedules.filter(s => s.userId !== null).length;
  const withAbsenceCode = normalizedSchedules.filter(s => (s.absenceCode ?? "").trim().length > 0).length;
  const validSchedules = normalizedSchedules.filter(s => s.userId !== null && (s.absenceCode ?? "").trim().length > 0).length;
  console.log(`${SYNC_LOG_PREFIX} Normalized ${normalizedSchedules.length} schedules: ${withUserId} with userId, ${withAbsenceCode} with absenceCode, ${validSchedules} valid`);
  
  // DEBUG: Log erste paar Schedules für Analyse
  if (normalizedSchedules.length > 0 && validSchedules === 0) {
    const sample = normalizedSchedules.slice(0, 3);
    console.log(`${SYNC_LOG_PREFIX} Sample schedules (first 3):`, JSON.stringify(sample, null, 2));
  }

  const normalizedPresences: RawUserPresence[] = presences.map(
    (p: MocoUserPresence) => ({
      id: p.id,
      date: p.date,
      from: p.from ?? null,
      to: p.to ?? null,
      userId: p.user?.id ?? null,
      createdAt: p.created_at ?? null,
      updatedAt: p.updated_at ?? null,
    })
  );

  console.log(`${SYNC_LOG_PREFIX} 💾 Processing ${normalizedActivities.length} activities...`);
  const isFullSync = !updatedAfterISO;
  await upsertActivities(normalizedActivities, activitiesWindow, isFullSync && !activitiesFetchFailed);
  console.log(`${SYNC_LOG_PREFIX} ✅ Activities processed`);
  
  console.log(`${SYNC_LOG_PREFIX} 💾 Processing ${normalizedSchedules.length} schedules...`);
  await upsertSchedules(normalizedSchedules, schedulesWindow, isFullSync && !schedulesFetchFailed);
  console.log(`${SYNC_LOG_PREFIX} ✅ Schedules processed`);
  
  console.log(`${SYNC_LOG_PREFIX} 💾 Processing ${normalizedPresences.length} presences...`);
  await upsertUserPresences(normalizedPresences, schedulesWindow);
  console.log(`${SYNC_LOG_PREFIX} ✅ Presences processed`);
  
  // Sync-Zeitpunkt nur speichern wenn Activities erfolgreich geladen wurden.
  // Gespeichert wird der Fetch-Start, nicht das Ende: Änderungen während eines
  // (beim Full-Sync minutenlangen) Fetches würden sonst vom nächsten updated_after übersprungen.
  if (!activitiesFetchFailed) {
    await setLastFrequentSyncTime(new Date(startTime));
  } else {
    console.warn(`${SYNC_LOG_PREFIX} ⚠️ Sync timestamp NOT updated due to activities fetch failure`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${SYNC_LOG_PREFIX} ✅ Sync completed in ${totalTime}s`);
}

async function syncPlanning(client: MocoClient, opts: { updatedAfter?: Date } = {}) {
  const planningWindow = computePlanningWindow();
  const updatedAfterISO = opts.updatedAfter ? toISODateTime(opts.updatedAfter) : undefined;

  console.log(
    `${SYNC_LOG_PREFIX} 📥 Fetching planning entries ${planningWindow.fromISO}→${planningWindow.toISO}${updatedAfterISO ? ` (after ${updatedAfterISO})` : ""}...`
  );

  let planning: MocoPlanningEntry[];
  try {
    planning = await client.planningEntries({
      period: `${planningWindow.fromISO}:${planningWindow.toISO}`,
      updated_after: updatedAfterISO,
    });
  } catch (e) {
    console.error(`${SYNC_LOG_PREFIX} ❌ Failed to fetch planning entries:`, e);
    // Wirft weiter damit der Aufrufer den Fehler kennt, aber blockiert setLastFullSyncTime nicht
    throw e;
  }

  console.log(`${SYNC_LOG_PREFIX} ✅ Fetched ${planning.length} planning entries from MOCO`);

  const normalizedPlanning: RawPlanning[] = planning.map(
    (p: MocoPlanningEntry) => ({
      id: p.id,
      startsOn: p.starts_on,
      endsOn: p.ends_on,
      hoursPerDay: Number(p.hours_per_day ?? 0),
      tentative: p.tentative ?? null,
      color: p.color ?? null,
      userId: p.user?.id ?? null,
      projectId: p.project?.id ?? null,
      taskId: p.task?.id ?? null,
      updatedAt: p.updated_at ?? null,
    })
  );

  // Prune (Geister-Einträge löschen) NUR beim Full-Sync (kein updatedAfter).
  // Beim Frequent-Sync liefert MOCO mit updated_after oft 0 Einträge,
  // was sonst dazu führt dass ALLE Einträge im Fenster gelöscht werden.
  const pruneWindow = opts.updatedAfter
    ? undefined
    : { from: planningWindow.from, to: planningWindow.to };

  await upsertPlanning(normalizedPlanning, pruneWindow);
}

async function syncAdditionalEntities(client: MocoClient) {
  // Tasks für alle Projekte
  const allProjects = await prisma.project.findMany({ select: { id: true } });
  const allTasks: MocoTask[] = [];
  for (const project of allProjects) {
    try {
      const tasks = await client.tasks({ project_id: project.id });
      allTasks.push(...tasks);
    } catch (e: any) {
      // 404 ist normal für Projekte ohne Tasks - nur bei anderen Fehlern warnen
      if (e?.message?.includes('404') || e?.responseCode === 404) {
        // Stille Behandlung: Projekte ohne Tasks sind normal
      } else {
        console.warn(`${SYNC_LOG_PREFIX} failed to fetch tasks for project ${project.id}:`, e);
      }
    }
  }
  await upsertTasks(
    allTasks.map(
      (t): RawTask => ({
        id: t.id,
        name: t.name,
        projectId: t.project_id ?? t.project?.id ?? null,
        billable: t.billable ?? null,
        active: t.active ?? true,
        budget: t.budget ?? null,
        budgetSpent: t.budget_spent ?? null,
        createdAt: t.created_at ?? null,
        updatedAt: t.updated_at ?? null,
      })
    )
  );

  // User Holidays (für aktuelles Jahr)
  const currentYear = new Date().getFullYear();
  try {
    const holidays = await client.userHolidays({ year: currentYear });
    await upsertUserHolidays(
      holidays.map(
        (h): RawUserHoliday => ({
          id: h.id,
          year: h.year,
          total: h.total ?? null,
          used: h.used ?? null,
          remaining: h.remaining ?? null,
          userId: h.user?.id ?? null,
          createdAt: h.created_at ?? null,
          updatedAt: h.updated_at ?? null,
        })
      )
    );
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} failed to fetch user holidays:`, e);
  }

  // Employments (für alle User)
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  const allEmployments: MocoEmployment[] = [];
  for (const user of allUsers) {
    try {
      const employments = await client.employments({
        from: new Date(new Date().getFullYear() - 1, 0, 1).toISOString().slice(0, 10),
        user_id: user.id,
      });
      allEmployments.push(...employments);
    } catch (e) {
      console.warn(`${SYNC_LOG_PREFIX} failed to fetch employments for user ${user.id}:`, e);
    }
  }
  await upsertEmployments(
    allEmployments.map(
      (e): RawEmployment => ({
        id: e.id,
        userId: e.user?.id ?? null,
        weeklyTargetHours: e.weekly_target_hours ?? null,
        patternAm: e.pattern?.am ?? null,
        patternPm: e.pattern?.pm ?? null,
        fromDate: e.from,
        toDate: e.to ? e.to : null,
        createdAt: e.created_at ?? null,
        updatedAt: e.updated_at ?? null,
      })
    )
  );

  // Tags
  try {
    const tags = await client.tags();
    await upsertTags(
      tags.map(
        (t): RawTag => ({
          id: t.id,
          name: t.name,
          color: t.color ?? null,
          createdAt: t.created_at ?? null,
          updatedAt: t.updated_at ?? null,
        })
      )
    );
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} failed to fetch tags:`, e);
  }

  // Contacts (für alle Companies)
  try {
    const [contactsActive, contactsArchived] = await Promise.all([
      client.contacts({ archived: false }).catch(() => []),
      client.contacts({ archived: true }).catch(() => []),
    ]);
    const allContacts = mergeById<MocoContact>(contactsActive, contactsArchived);
    await upsertContacts(
      allContacts.map(
        (c): RawContact => ({
          id: c.id,
          firstname: c.firstname ?? null,
          lastname: c.lastname ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          mobilePhone: c.mobile_phone ?? null,
          companyId: c.company_id ?? c.company?.id ?? null,
          archived: c.archived ?? false,
          createdAt: c.created_at ?? null,
          updatedAt: c.updated_at ?? null,
        })
      )
    );
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} failed to fetch contacts:`, e);
  }

  // User Presences (für aktuelles Jahr + letztes Jahr)
  const activitiesWindow = computeActivitiesWindow();
  try {
    const presences = await client.userPresences({
      from: activitiesWindow.fromISO,
      to: activitiesWindow.toISO,
    });
    await upsertUserPresences(
      presences.map(
        (p): RawUserPresence => ({
          id: p.id,
          date: p.date,
          from: p.from ?? null,
          to: p.to ?? null,
          userId: p.user?.id ?? null,
          createdAt: p.created_at ?? null,
          updatedAt: p.updated_at ?? null,
        })
      ),
      activitiesWindow
    );
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} failed to fetch user presences:`, e);
  }

  // Work Time Adjustments (für aktuelles Jahr + letztes Jahr)
  try {
    const adjustments = await client.workTimeAdjustments({
      from: activitiesWindow.fromISO,
      to: activitiesWindow.toISO,
    });
    await upsertWorkTimeAdjustments(
      adjustments.map(
        (w): RawWorkTimeAdjustment => ({
          id: w.id,
          date: w.date,
          hours: w.hours ?? null,
          comment: w.comment ?? null,
          userId: w.user?.id ?? null,
          createdAt: w.created_at ?? null,
          updatedAt: w.updated_at ?? null,
        })
      )
    );
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} failed to fetch work time adjustments:`, e);
  }

  // Project Expenses, Payment Schedules und Contracts werden nicht synchronisiert (nicht benötigt)

  // Project Groups
  try {
    const groups = await client.projectGroups();
    await upsertProjectGroups(
      groups.map(
        (g): RawProjectGroup => ({
          id: g.id,
          name: g.name,
          createdAt: g.created_at ?? null,
          updatedAt: g.updated_at ?? null,
        })
      )
    );
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} failed to fetch project groups:`, e);
  }


  // Units/Teams
  try {
    const units = await client.units();
    await upsertUnits(
      units.map(
        (u): RawUnit => ({
          id: u.id,
          name: u.name,
          createdAt: u.created_at ?? null,
          updatedAt: u.updated_at ?? null,
        })
      )
    );
  } catch (e) {
    console.warn(`${SYNC_LOG_PREFIX} failed to fetch units:`, e);
  }
}

/**
 * Vollständiger Sync (täglich, 02:00 Uhr):
 * Users, Projects, Companies, Tasks, Holidays, Employments, Tags
 * + Activities/Schedules/Planning mit eingeschränktem Datumsfenster (ohne updated_after)
 */
export async function syncFull(): Promise<void> {
  if (syncLock) {
    console.warn(`${SYNC_LOG_PREFIX} [FULL] sync already in progress – skipping`);
    return;
  }
  syncLock = true;
  const client = ensureClient();
  if (!client) { syncLock = false; return; }

  console.log(`${SYNC_LOG_PREFIX} [FULL] start ${new Date().toISOString()}`);
  const t0 = Date.now();
  let hadError = false;
  try {
    await syncUsersAndProjects(client);
    await syncAdditionalEntities(client);
    // Full-Sync holt Activities/Schedules/Planning ohne updated_after (komplettes Fenster)
    await syncActivitiesAndSchedules(client);
    await syncPlanning(client).catch((err) => {
      console.error(`${SYNC_LOG_PREFIX} [FULL] syncPlanning failed (non-fatal):`, err);
      hadError = true;
    });
    // Timestamp immer setzen – auch wenn Teile fehlschlugen – damit kein endloser
    // Startup-Trigger entsteht (checkAndRunFullSyncIfStale würde sonst bei jedem
    // Container-Start einen neuen Full-Sync auslösen).
    await setLastFullSyncTime(new Date());
    if (hadError) {
      console.warn(`${SYNC_LOG_PREFIX} [FULL] done with partial errors ${new Date().toISOString()} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } else {
      console.log(`${SYNC_LOG_PREFIX} [FULL] done ${new Date().toISOString()} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  } catch (err) {
    console.error(`${SYNC_LOG_PREFIX} [FULL] failed:`, err);
    throw err;
  } finally {
    syncLock = false;
  }
}

/**
 * Häufiger Sync (alle 15 Minuten):
 * Activities, Schedules, Planning – nur Änderungen seit letztem Sync (updated_after)
 */
export async function syncFrequent(): Promise<void> {
  if (syncLock) {
    console.warn(`${SYNC_LOG_PREFIX} [FREQUENT] sync already in progress – skipping`);
    return;
  }
  syncLock = true;
  const client = ensureClient();
  if (!client) { syncLock = false; return; }

  try {
    const lastSync = await getLastFrequentSyncTime();

    // Immer updated_after nutzen, wenn ein vorheriger Sync-Zeitpunkt existiert – unabhängig vom Alter.
    // Der tägliche syncFull() übernimmt den vollständigen Rebuild ohne updated_after.
    // Die frühere 24h-Grenze führte zu einem Full-Fetch, der regelmäßig den MOCO-Rate-Limit
    // trifft und dann den Timestamp nie aktualisiert → Endlosschleife.
    const updatedAfter = lastSync ?? undefined;

    const activitiesWindow = computeActivitiesWindow();
    const planningWindow = computePlanningWindow();
    console.log(
      `${SYNC_LOG_PREFIX} [FREQUENT] Activities: ${activitiesWindow.fromISO}→${activitiesWindow.toISO}, Planning: ${planningWindow.fromISO}→${planningWindow.toISO}${updatedAfter ? ` | updated_after=${toISODateTime(updatedAfter)}` : " | full"}`
    );

    await syncActivitiesAndSchedules(client, { updatedAfter });
    await syncPlanning(client, { updatedAfter });

    console.log(`${SYNC_LOG_PREFIX} [FREQUENT] done ${new Date().toISOString()}`);
  } catch (err) {
    console.error(`${SYNC_LOG_PREFIX} [FREQUENT] failed:`, err);
    throw err;
  } finally {
    syncLock = false;
  }
}

/**
 * Startet einen Full-Sync, wenn der letzte Full-Sync älter als `thresholdMs` ist.
 * Wird beim Container-Start aufgerufen, damit nicht bis 02:00 gewartet werden muss.
 */
export async function checkAndRunFullSyncIfStale(thresholdMs = 60 * 60 * 1000): Promise<void> {
  const lastFull = await getLastFullSyncTime();
  if (!lastFull || (Date.now() - lastFull.getTime()) > thresholdMs) {
    const age = lastFull
      ? `${((Date.now() - lastFull.getTime()) / 60000).toFixed(0)}min ago`
      : "never";
    console.log(`${SYNC_LOG_PREFIX} [STARTUP] Last full sync: ${age} – triggering full sync now`);
    await syncFull().catch(console.error);
  } else {
    console.log(`${SYNC_LOG_PREFIX} [STARTUP] Last full sync was recent (${((Date.now() - lastFull.getTime()) / 60000).toFixed(0)}min ago) – skipping initial full sync`);
  }
}

/**
 * Legacy: Vollständiger Sync mit allen Daten
 * @deprecated Verwende syncFull() + syncFrequent() stattdessen
 */
export async function syncCore(window?: SyncWindow): Promise<void> {
  await syncFull();
  await syncFrequent();
}

export default syncCore;
