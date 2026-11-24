/**
 * Security verification specification test suite for firestore.rules
 * Covers the 12 "Dirty Dozen" adversarial payloads defined in security_spec.md.
 */

export interface SecurityTestCase {
  id: string;
  description: string;
  expected: 'PERMISSION_DENIED';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
}

export const dirtyDozenSecurityCases: SecurityTestCase[] = [
  {
    id: 'DD-01',
    description: 'Unauthenticated user read on /users/{uid}',
    expected: 'PERMISSION_DENIED',
    operation: 'get',
    path: 'users/trader01',
    auth: null,
  },
  {
    id: 'DD-02',
    description: 'Cross-user PII read attempt',
    expected: 'PERMISSION_DENIED',
    operation: 'get',
    path: 'users/victim01',
    auth: { uid: 'attacker01', email: 'attacker@example.com', email_verified: true },
  },
  {
    id: 'DD-03',
    description: 'Unverified email user attempt to create profile',
    expected: 'PERMISSION_DENIED',
    operation: 'create',
    path: 'users/trader02',
    auth: { uid: 'trader02', email: 'trader02@example.com', email_verified: false },
    payload: { uid: 'trader02', subscriptionTier: 'trial' },
  },
  {
    id: 'DD-04',
    description: 'Shadow ghost field injection (isAdmin: true)',
    expected: 'PERMISSION_DENIED',
    operation: 'create',
    path: 'users/trader03',
    auth: { uid: 'trader03', email: 'trader03@example.com', email_verified: true },
    payload: { uid: 'trader03', isAdmin: true },
  },
  {
    id: 'DD-05',
    description: 'Trial self-extension attempt on update',
    expected: 'PERMISSION_DENIED',
    operation: 'update',
    path: 'users/trader01',
    auth: { uid: 'trader01', email: 'trader01@example.com', email_verified: true },
    payload: { trialEndsAt: '2099-01-01T00:00:00Z' },
  },
  {
    id: 'DD-06',
    description: 'UID spoofing inside brokerConnections subcollection',
    expected: 'PERMISSION_DENIED',
    operation: 'create',
    path: 'users/trader01/brokerConnections/primary',
    auth: { uid: 'trader01', email: 'trader01@example.com', email_verified: true },
    payload: { userId: 'victim01', brokerName: 'Broker' },
  },
  {
    id: 'DD-07',
    description: 'Orphaned subcollection write without parent user doc',
    expected: 'PERMISSION_DENIED',
    operation: 'create',
    path: 'users/ghostUser/watchlists/RELIANCE',
    auth: { uid: 'ghostUser', email: 'ghost@example.com', email_verified: true },
    payload: { userId: 'ghostUser', symbol: 'RELIANCE' },
  },
  {
    id: 'DD-08',
    description: 'Oversized message payload (>1500 chars) on contactInquiries',
    expected: 'PERMISSION_DENIED',
    operation: 'create',
    path: 'contactInquiries/inq01',
    auth: null,
    payload: { name: 'Tester', email: 't@example.com', phone: 'XXXXXXXXXX', message: 'A'.repeat(2000) },
  },
  {
    id: 'DD-09',
    description: 'Invalid characters in document ID',
    expected: 'PERMISSION_DENIED',
    operation: 'create',
    path: 'users/trader01/watchlists/bad$id',
    auth: { uid: 'trader01', email: 'trader01@example.com', email_verified: true },
  },
  {
    id: 'DD-10',
    description: 'Client-forged timestamp on profile creation',
    expected: 'PERMISSION_DENIED',
    operation: 'create',
    path: 'users/trader04',
    auth: { uid: 'trader04', email: 'trader04@example.com', email_verified: true },
    payload: { uid: 'trader04', createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 'DD-11',
    description: 'Unauthorized list query on contactInquiries',
    expected: 'PERMISSION_DENIED',
    operation: 'list',
    path: 'contactInquiries',
    auth: { uid: 'trader01', email: 'trader01@example.com', email_verified: true },
  },
  {
    id: 'DD-12',
    description: 'Blanket list enumeration on /users',
    expected: 'PERMISSION_DENIED',
    operation: 'list',
    path: 'users',
    auth: { uid: 'trader01', email: 'trader01@example.com', email_verified: true },
  },
];
