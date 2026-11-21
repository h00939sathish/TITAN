import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AuditLogEntry,
  QualificationEntry,
  RemediationStatus,
} from '../types/trading';

const ID_CLEAN_REGEX = /[^a-zA-Z0-9_-]/g;

function sanitizeId(raw: string, maxLen: number): string {
  const cleaned = raw.replace(ID_CLEAN_REGEX, '_').slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

function sanitizeText(raw: string, maxLen: number): string {
  return raw.trim().slice(0, maxLen);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ensures the parent /users/{uid} workspace root exists before any subcollection write,
 * satisfying the Firestore Master Gate invariant. Stores zero PII.
 */
export async function ensureUserWorkspace(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const displayName = sanitizeText(user.displayName || 'Quant Operator', 100) || 'Quant Operator';
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        paperStartDate: todayIsoDate(),
        targetQualificationDays: 60,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface CloudRemediationRecord {
  taskId: string;
  status: RemediationStatus;
  note: string;
}

export function subscribeRemediationTasks(
  uid: string,
  onData: (records: Record<string, CloudRemediationRecord>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/remediationTasks`;
  const q = query(
    collection(db, 'users', uid, 'remediationTasks'),
    where('ownerId', '==', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, CloudRemediationRecord> = {};
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (
          typeof d.taskId === 'string' &&
          (d.status === 'pending' ||
            d.status === 'in_progress' ||
            d.status === 'verified')
        ) {
          map[d.taskId] = {
            taskId: d.taskId,
            status: d.status,
            note: typeof d.note === 'string' ? d.note : '',
          };
        }
      });
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveRemediationTaskState(
  uid: string,
  taskId: string,
  status: RemediationStatus,
  note: string,
  existsInCloud: boolean
): Promise<void> {
  const path = `users/${uid}/remediationTasks/${taskId}`;
  const ref = doc(db, 'users', uid, 'remediationTasks', taskId);
  const safeNote = sanitizeText(note, 500);
  try {
    if (existsInCloud) {
      await updateDoc(ref, {
        status,
        note: safeNote,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        taskId,
        ownerId: uid,
        status,
        note: safeNote,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existsInCloud ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export function subscribeQualificationLogs(
  uid: string,
  onData: (entries: QualificationEntry[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/qualificationLogs`;
  const q = query(
    collection(db, 'users', uid, 'qualificationLogs'),
    where('ownerId', '==', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: QualificationEntry[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (typeof d.entryId === 'string' && typeof d.date === 'string') {
          rows.push({
            entryId: d.entryId,
            date: d.date,
            dayNumber: Number(d.dayNumber || 1),
            equityUsd: Number(d.equityUsd || 0),
            dailyPnlUsd: Number(d.dailyPnlUsd || 0),
            netSharpe: Number(d.netSharpe || 0),
            maxDrawdownPct: Number(d.maxDrawdownPct || 0),
            slippageCostUsd: Number(d.slippageCostUsd || 0),
            guardTripsCount: Number(d.guardTripsCount || 0),
            allGuardsNominal: Boolean(d.allGuardsNominal),
            notes: typeof d.notes === 'string' ? d.notes : '',
          });
        }
      });
      rows.sort((a, b) => b.date.localeCompare(a.date));
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveQualificationEntry(
  uid: string,
  entry: QualificationEntry,
  existsInCloud: boolean
): Promise<void> {
  const path = `users/${uid}/qualificationLogs/${entry.entryId}`;
  const ref = doc(db, 'users', uid, 'qualificationLogs', entry.entryId);
  const safeNotes = sanitizeText(entry.notes, 500);
  try {
    if (existsInCloud) {
      await updateDoc(ref, {
        dayNumber: entry.dayNumber,
        equityUsd: entry.equityUsd,
        dailyPnlUsd: entry.dailyPnlUsd,
        netSharpe: entry.netSharpe,
        maxDrawdownPct: entry.maxDrawdownPct,
        slippageCostUsd: entry.slippageCostUsd,
        guardTripsCount: entry.guardTripsCount,
        allGuardsNominal: entry.allGuardsNominal,
        notes: safeNotes,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        entryId: entry.entryId,
        ownerId: uid,
        date: entry.date,
        dayNumber: entry.dayNumber,
        equityUsd: entry.equityUsd,
        dailyPnlUsd: entry.dailyPnlUsd,
        netSharpe: entry.netSharpe,
        maxDrawdownPct: entry.maxDrawdownPct,
        slippageCostUsd: entry.slippageCostUsd,
        guardTripsCount: entry.guardTripsCount,
        allGuardsNominal: entry.allGuardsNominal,
        notes: safeNotes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existsInCloud ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export async function removeQualificationEntry(
  uid: string,
  entryId: string
): Promise<void> {
  const path = `users/${uid}/qualificationLogs/${entryId}`;
  const ref = doc(db, 'users', uid, 'qualificationLogs', entryId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeCloudAuditLogs(
  uid: string,
  onData: (logs: AuditLogEntry[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/auditLogs`;
  const q = query(
    collection(db, 'users', uid, 'auditLogs'),
    where('ownerId', '==', uid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: (AuditLogEntry & { sortMs: number })[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const createdMs =
          d.createdAt && typeof d.createdAt.toMillis === 'function'
            ? d.createdAt.toMillis()
            : 0;
        items.push({
          id: typeof d.logId === 'string' ? d.logId : docSnap.id,
          timestamp:
            typeof d.recordedTime === 'string' ? d.recordedTime : '00:00:00',
          level:
            d.level === 'INFO' ||
            d.level === 'EXEC' ||
            d.level === 'RISK' ||
            d.level === 'WARN'
              ? d.level
              : 'INFO',
          module: typeof d.module === 'string' ? d.module : 'Cloud',
          message: typeof d.message === 'string' ? d.message : '',
          sortMs: createdMs,
        });
      });
      items.sort((a, b) => b.sortMs - a.sortMs);
      onData(items.slice(0, 150).map(({ sortMs: _s, ...rest }) => rest));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function appendCloudAuditLog(
  uid: string,
  entry: AuditLogEntry
): Promise<void> {
  const logId = sanitizeId(entry.id, 64);
  const path = `users/${uid}/auditLogs/${logId}`;
  const ref = doc(db, 'users', uid, 'auditLogs', logId);
  try {
    await setDoc(ref, {
      logId,
      ownerId: uid,
      level: entry.level,
      module: sanitizeText(entry.module, 64) || 'System',
      message: sanitizeText(entry.message, 500) || 'Operator action recorded.',
      recordedTime: sanitizeText(entry.timestamp, 32) || '00:00:00',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
