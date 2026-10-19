/**
 * Typed client for the admin Cloud Functions (functions/src/index.ts).
 *
 * Staff identity operations are server-only: there is deliberately NO client-side fallback,
 * because a fallback would let Firebase Auth, Custom Claims and staff documents drift apart.
 */
import { getFunctionsService } from '../firebase';
import { StaffAccount, StaffRole } from '../../types/admin';
import { TIMEOUTS } from '../../config/appConfig';

export class AdminFunctionError extends Error {
  /** true when the request may still have succeeded on the server (timeout / network loss). */
  readonly outcomeUnknown: boolean;
  readonly code: string;

  constructor(message: string, code: string, outcomeUnknown = false) {
    super(message);
    this.name = 'AdminFunctionError';
    this.code = code;
    this.outcomeUnknown = outcomeUnknown;
  }
}

function translateError(fnName: string, err: any): AdminFunctionError {
  const rawCode = String(err?.code || '');
  const code = rawCode.replace(/^functions\//, '');
  const serverMessage = typeof err?.message === 'string' ? err.message : '';

  switch (code) {
    case 'not-found':
      // Callable endpoint does not exist -> functions are not deployed (or wrong region).
      if (!serverMessage || /^not[\s_-]*found$/i.test(serverMessage.trim())) {
        return new AdminFunctionError(
          `后台服务 ${fnName} 未部署：请先执行 firebase deploy --only functions 后再进行员工账号管理。`,
          code
        );
      }
      return new AdminFunctionError(serverMessage, code);
    case 'deadline-exceeded':
    case 'unavailable':
    case 'internal':
      if (code !== 'internal' || !serverMessage || serverMessage.trim().toLowerCase() === 'internal') {
        return new AdminFunctionError(
          '后台服务响应超时或网络中断，操作结果待确认：请稍候刷新员工列表查看是否已生效，切勿立即重复提交。',
          code,
          true
        );
      }
      return new AdminFunctionError(serverMessage, code);
    case 'unauthenticated':
      return new AdminFunctionError('登录状态已失效，请重新登录超级管理员账号。', code);
    default:
      return new AdminFunctionError(serverMessage || `后台服务 ${fnName} 调用失败。`, code || 'unknown');
  }
}

async function callAdminFunction<Req, Res>(fnName: string, payload: Req): Promise<Res> {
  const [{ httpsCallable }, functions] = await Promise.all([import('firebase/functions'), getFunctionsService()]);
  const callable = httpsCallable<Req, Res>(functions, fnName, { timeout: TIMEOUTS.adminCallable });
  try {
    const result = await callable(payload);
    return result.data;
  } catch (err) {
    throw translateError(fnName, err);
  }
}

export interface CreateStaffRequest {
  name: string;
  phone: string;
  email?: string;
  password: string;
  role: StaffRole;
}

export const adminFunctions = {
  createStaff(data: CreateStaffRequest) {
    return callAdminFunction<CreateStaffRequest, { staff: StaffAccount }>('adminCreateStaff', data);
  },

  deleteStaff(staffIds: string[]) {
    return callAdminFunction<
      { staffIds: string[] },
      { deletedIds: string[]; successCount: number; skippedCurrent: boolean; releasedLeadCount: number }
    >('adminDeleteStaff', { staffIds });
  },

  updateStaffStatus(staffIds: string[], status: 'active' | 'suspended') {
    return callAdminFunction<
      { staffIds: string[]; status: 'active' | 'suspended' },
      { updatedIds: string[]; count: number; skippedSelf: boolean }
    >('adminUpdateStaffStatus', { staffIds, status });
  },

  resetStaffPassword(staffId: string, newPassword: string) {
    return callAdminFunction<{ staffId: string; newPassword: string }, { success: boolean }>(
      'adminResetStaffPassword',
      { staffId, newPassword }
    );
  }
};
