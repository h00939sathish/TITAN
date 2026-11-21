# Titan Quant Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: All unmatched paths under `/databases/{database}/documents` are unconditionally denied.
2. **Strict Owner Isolation & Zero PII**: Every collection is strictly scoped under `/users/{userId}`. Only the verified authenticated owner (`request.auth.uid == userId && request.auth.token.email_verified == true`) can write, and only the authenticated owner can read. No PII (`email`, `phone`, `address`) is stored in Firestore.
3. **Master Gate**: Subcollection documents (`remediationTasks`, `qualificationLogs`, `auditLogs`) cannot be created or read via single-doc `get` unless the parent `/users/{userId}` document exists and its `uid == request.auth.uid`.
4. **Immutable Ownership & Timestamps**: `ownerId` / `uid` and `createdAt` can never be mutated after creation. `createdAt == request.time` on create; `updatedAt == request.time` on update.
5. **Immutable Audit Trail**: `auditLogs` are append-only (`allow update: if false;`) to preserve tamper-evident execution history.
6. **Strict Schema & Bounds**: Every write enforces `hasAll` + `hasOnly`, regex ID checks (`isValidId`), enum allowlists, numeric bounds, and `.size()` limits on every string field matching `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Fail with PERMISSION_DENIED)
1. **Shadow Field Injection on Workspace Create**: Creating `/users/{uid}` with an extra `isAdmin: true` ghost field.
2. **Identity Spoofing on Remediation Create**: Creating `/users/{uid}/remediationTasks/REM-001` with `ownerId: "victim_uid"`.
3. **Cross-User Read Attempt**: Authenticated User B attempting `get` or `list` on `/users/{uidA}/qualificationLogs`.
4. **Unverified Email Write**: Authenticated user with `email_verified: false` attempting to create a `QualificationEntry`.
5. **Client-Forged Timestamp**: Creating a `QualificationEntry` with a backdated `createdAt` instead of `request.time`.
6. **ID Poisoning**: Attempting to write `/users/{uid}/auditLogs/<200-char-invalid-id!@#$>`.
7. **Resource Exhaustion (1MB Notes)**: Writing a `QualificationEntry` with `notes` > 500 characters.
8. **Invalid Enum Status**: Updating `remediationTasks/REM-001` with `status: "hacked"`.
9. **Immutable Field Tampering**: Updating `remediationTasks/REM-001` while modifying `createdAt` or `taskId`.
10. **Audit Log Mutation**: Attempting to `update` an existing `/users/{uid}/auditLogs/{logId}` document.
11. **Out-of-Bounds Numeric Poisoning**: Creating a `QualificationEntry` with `dayNumber: 9999` or `maxDrawdownPct: -50`.
12. **Orphaned Subcollection Write**: Writing `/users/{uid}/qualificationLogs/2026-11-21` before the parent `/users/{uid}` workspace document exists.
