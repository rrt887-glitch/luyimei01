#!/usr/bin/env node
/**
 * One-Time Super Admin Bootstrap Script (Firebase Admin SDK)
 *
 * Security Purpose:
 *   All email-based admin checks have been removed from `firestore.rules` and frontend code.
 *   Administrator privileges are strictly determined by:
 *     1. Server-side Custom Claims (`request.auth.token.role == 'super_admin'`)
 *     2. Verified `staff/{uid}` RBAC document in Firestore (`role: 'super_admin', status: 'active'`)
 *
 * Usage:
 *   1. Export your GCP / Firebase Service Account key path:
 *      export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *   2. Run this script once to initialize or promote a Super Admin account:
 *      node scripts/init-super-admin.mjs --email="your-admin@company.com" --phone="13800001234" --name="系统超级管理员" --password="YourStrongPassword123!"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../firebase-applet-config.json');
const appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [k, ...rest] = arg.slice(2).split('=');
      args[k] = rest.join('=') || 'true';
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const email = (args.email || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const phone = (args.phone || process.env.ADMIN_PHONE || '').replace(/\D/g, '');
  const name = (args.name || process.env.ADMIN_NAME || '系统超级管理员').trim();
  const password = (args.password || process.env.ADMIN_PASSWORD || '').trim();
  const role = args.role === 'sales_rep' ? 'sales_rep' : 'super_admin';

  if (!email || !email.includes('@')) {
    console.error(
      '错误：请提供管理员邮箱，例如：\n  node scripts/init-super-admin.mjs --email="admin@yourcompany.com" --phone="13912345678" --password="StrongPassword123!"'
    );
    process.exit(1);
  }

  let adminApp;
  let adminAuth;
  let adminFirestore;

  try {
    const { initializeApp, applicationDefault } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore } = await import('firebase-admin/firestore');

    adminApp = initializeApp({
      credential: applicationDefault(),
      projectId: appletConfig.projectId
    });
    adminAuth = getAuth(adminApp);
    adminFirestore = appletConfig.firestoreDatabaseId
      ? getFirestore(adminApp, appletConfig.firestoreDatabaseId)
      : getFirestore(adminApp);
  } catch (err) {
    console.error(
      '无法加载 firebase-admin 或未配置 GOOGLE_APPLICATION_CREDENTIALS 服务账号凭证：',
      err.message
    );
    console.error('请先运行: npm i -D firebase-admin 并配置 GOOGLE_APPLICATION_CREDENTIALS 环境变量。');
    process.exit(1);
  }

  let userRecord;
  try {
    userRecord = await adminAuth.getUserByEmail(email);
    console.log(`[1/3] 已找到现有 Firebase Auth 用户: ${userRecord.uid} (${email})`);
    if (password && password.length >= 8) {
      await adminAuth.updateUser(userRecord.uid, {
        password,
        emailVerified: true,
        displayName: name
      });
    } else {
      await adminAuth.updateUser(userRecord.uid, {
        emailVerified: true,
        displayName: name
      });
    }
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      if (!password || password.length < 8) {
        console.error('错误：该邮箱尚未在 Firebase Auth 注册，请通过 --password 提供不少于 8 位的初始密码。');
        process.exit(1);
      }
      userRecord = await adminAuth.createUser({
        email,
        password,
        displayName: name,
        emailVerified: true
      });
      console.log(`[1/3] 已创建新的 Firebase Auth 用户: ${userRecord.uid} (${email})`);
    } else {
      throw err;
    }
  }

  // 2. Set Custom Claims via Admin SDK (request.auth.token.role)
  await adminAuth.setCustomUserClaims(userRecord.uid, {
    role,
    staff: true
  });
  console.log(`[2/3] 已通过 Admin SDK 写入 Custom Claims: { role: '${role}', staff: true }`);

  // 3. Synchronize staff/{uid} document in Firestore matching StaffAccount schema
  const nowIso = new Date().toISOString();
  const staffDoc = {
    id: userRecord.uid,
    uid: userRecord.uid,
    name,
    phone,
    email,
    role,
    status: 'active',
    assignedLeadsCount: 0,
    lastLoginAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  await adminFirestore.collection('staff').doc(userRecord.uid).set(staffDoc, { merge: true });
  console.log(`[3/3] 已写入 Firestore staff/${userRecord.uid} 角色档案，初始化完成！`);
}

main().catch(err => {
  console.error('初始化管理员失败:', err);
  process.exit(1);
});
