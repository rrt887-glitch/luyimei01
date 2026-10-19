# Firestore Zero-Trust Security Specification (`security_spec.md`)

Every invariant below is executed against the real rules in `tests/firestore.rules.emulator.test.ts`
(`npm run test:emulator`). Field whitelists are cross-checked with `firebase-blueprint.json` and
`src/utils/firestoreSanitizer.ts` in `tests/firestore.rules.test.ts`.

## 1. Data Invariants

1. **Default-Deny Catch-All**: every unmatched path is denied (`allow read, write: if false`).
2. **Document-Backed RBAC (single source of truth)**:
   - A caller is staff **iff** `staff/{request.auth.uid}` exists and its `status` is `active`.
   - `isAdmin()` additionally requires `role == 'super_admin'`; `isActiveStaff()` accepts `super_admin` or `sales_rep`.
   - Custom Claims are **never** used for authorization (rules, storage rules and Cloud Functions alike).
     Suspending, demoting or deleting the staff document revokes access immediately, and stale claims of a
     deleted employee grant nothing.
3. **Staff Directory (`/staff/{uid}`)**:
   - Never readable by unauthenticated visitors; a user may `get` their own document; only active staff may `list`.
   - `create` / `delete` and any change of `role` / `status` are **Admin SDK only** (Cloud Functions
     `adminCreateStaff`, `adminDeleteStaff`, `adminUpdateStaffStatus`, or `scripts/init-super-admin.mjs`).
   - Active staff may only change their own `lastLoginAt` / `updatedAt`; a super admin may edit `name` / `email` / `phone`.
   - Documents may never contain `password`, `passwordHash`, `salt` or `sessionToken` (`hasOnly` whitelist).
4. **Inquiries (`/inquiries/{id}`)**:
   - Public visitors may only `create` a clean inquiry (`stage == 'new'`, `status == 'pending'`, no value / owner / notes,
     `buyerUid` only equal to their own uid, `id` equal to the document id).
   - `assignedStaffId` is always present; `''` means the public pool.
   - Super admins read all inquiries; sales reps read ONLY pool leads and their own leads
     (`assignedStaffId in ['', uid]`); a buyer can read inquiries whose `buyerUid` equals their uid.
   - `customerId` is set only by the server (`onInquiryCreated`); clients can neither set nor change it.
   - Sales reps may only update leads that are in the public pool or assigned to themselves, may only assign leads to
     themselves or release them, cannot change `createdAt` / `buyerUid`, and follow-up `notes` are append-only.
   - Sales reps may create manual leads only unassigned or assigned to themselves.
   - Only super admins can delete.
5. **Catalog & Site Config (`/products`, `/site_config`)**: public read; write only by super admin with schema validation.
   Product media in Storage follows the same rule (`storage.rules`).
   Exception: `site_config/billing` (bank details printed on quotations) is readable by active staff only, never by
   visitors or buyers, and must match `isValidBillingConfig` (a contact payload cannot be written there and vice versa).
6. **Favorites**: every read / create / delete requires `userId == request.auth.uid`.
7. **Customers**: super admin only for read / update / delete (the archive holds every client's contacts, so reps must not
   bypass lead isolation through it); a newly registered buyer may create only `CUST-{uid}` once with zeroed counters.
   `inquiryCount` / `totalQuotationUsd` are maintained by Cloud Functions.
8. **Append-Only Audit Trail (`/audit_logs/{id}`)**: active staff may create entries in their own name (`operator` and
   `operatorRole` must match the caller's staff document); only super admins may read; `update` / `delete` are always denied.
9. **Quotations (`/quotations/{id}`)**: active staff create quotations only in their own name (`createdByUid`, `createdBy`);
   immutable afterwards; super admins read all, reps read only their own; only super admins delete.

## 2. Adversarial Payloads (all must be `PERMISSION_DENIED`)

1. Unauthenticated `list` / `get` on `/inquiries` or `/staff`.
2. Any client (even a super admin) creating or deleting `/staff/{uid}`.
3. Any client changing `role` or `status` on `/staff/{uid}` (including a sales rep promoting themselves).
4. A deleted employee whose ID token still carries `{ role: 'super_admin' }` reading inquiries or writing products.
5. A suspended super admin reading inquiries or deleting leads.
6. Anonymous or `sales_rep` user updating `/products/*` or `/site_config/*`.
7. Anonymous visitor creating an inquiry with `stage: 'won'`, `estimatedValueUsd`, `assignedStaffId`, `notes`,
   a foreign `buyerUid`, or an `id` different from the document id.
8. Sales rep updating, re-assigning or claiming a lead owned by another rep; assigning a pool lead to someone else.
9. Sales rep deleting or rewriting existing follow-up notes, or changing `createdAt` / `buyerUid`.
10. Staff writing an audit log under another operator's name or role; anyone updating / deleting audit logs.
11. User A creating a favorite or customer record for user B.
12. Oversized payloads or unknown fields on any collection (`hasOnly` + size bounds).
13. Sales rep reading a colleague's lead, listing all inquiries without the `assignedStaffId in ['', uid]` filter,
    reading / listing customers or audit logs, or setting `customerId` on a lead.
14. Removing `assignedStaffId` from a lead (release to pool must write `''`).
15. Issuing a quotation in someone else's name, updating an issued quotation, or a rep reading another rep's quotations.
16. A visitor, buyer or suspended admin reading `site_config/billing`; a sales rep writing it; writing unknown fields or an
    empty account number to it.
