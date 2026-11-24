# Security Specification & Threat Model

## 1. Data Invariants
1. A user document in `/users/{userId}` can only be read or created/updated by the authenticated and email-verified user whose `request.auth.uid == userId`.
2. `uid`, `createdAt`, and `trialEndsAt` are immutable after initial user document creation; users cannot self-extend `trialEndsAt`.
3. Every subcollection under `/users/{userId}` (`brokerConnections`, `watchlists`) verifies `get(/databases/$(database)/documents/users/$(userId)).data.uid == request.auth.uid` (Master Gate) and validates `userId == request.auth.uid`.
4. No raw MPIN, OTP, or broker API secrets may ever be written to Firestore.
5. `contactInquiries` is strictly create-only with bounded string lengths and server timestamp enforcement; public reads/lists/updates/deletes are denied.
6. All document IDs are validated with `isValidId()` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. **Unauthenticated User Read**: `GET /users/user123` with `auth: null` -> `PERMISSION_DENIED`.
2. **Cross-User Profile Read (PII Leak)**: `GET /users/victimUid` as `attackerUid` -> `PERMISSION_DENIED`.
3. **Unverified Email Write**: `CREATE /users/user1` with `email_verified: false` -> `PERMISSION_DENIED`.
4. **Shadow Ghost Field Injection**: `CREATE /users/user1` including extra field `isAdmin: true` -> `PERMISSION_DENIED`.
5. **Trial Self-Extension Attack**: `UPDATE /users/user1` modifying `trialEndsAt` -> `PERMISSION_DENIED`.
6. **UID Spoofing on Subcollection**: `CREATE /users/user1/brokerConnections/primary` with `userId: "otherUser"` -> `PERMISSION_DENIED`.
7. **Orphaned Subcollection Write**: `CREATE /users/nonExistentUser/watchlists/RELIANCE` -> `PERMISSION_DENIED` (Master Gate `exists` fails).
8. **Resource Exhaustion / 1MB String**: `CREATE /contactInquiries/inq1` with `message` > 1500 chars -> `PERMISSION_DENIED`.
9. **ID Poisoning**: `CREATE /users/user1/watchlists/../../evil` -> `PERMISSION_DENIED`.
10. **Client-Forged Timestamp**: `CREATE /users/user1` with `createdAt` != `request.time` -> `PERMISSION_DENIED`.
11. **Public Scrape of Contact Inquiries**: `LIST /contactInquiries` as any signed-in user -> `PERMISSION_DENIED`.
12. **Blanket User List Enumeration**: `LIST /users` as signed-in user -> `PERMISSION_DENIED`.
