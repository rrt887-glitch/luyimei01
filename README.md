# 路易美道路养护工程门户

前台官网（产品目录、询价、买家中心）+ 业务中台（CRM 线索、客户、报价单、商品、团队权限、审计日志）。
React 19 + Vite 前端，Firebase（Auth / Firestore 命名数据库 / Storage / Cloud Functions）后端。

## 架构概览

```
浏览器 (React)
  ├─ 前台：产品目录 / 询价表单 / 买家注册登录 / 收藏
  └─ 中台：src/services/adminApi.ts（门面）
        ├─ admin/staffAuthService.ts   员工登录、会话、员工目录（只读）
        ├─ admin/adminFunctions.ts     员工开通/删除/停用/改密 → Cloud Functions
        ├─ admin/leadsCrmService.ts    线索（销售只订阅公海+本人；局部更新 updateDoc + arrayUnion）
        ├─ admin/quotationService.ts   报价单（落库、编号防重、同一单号只回写一次）
        ├─ admin/customerService.ts    客户档案（仅超级管理员）
        └─ admin/auditLogService.ts    审计日志（只增不改，仅超级管理员可读）

Firestore 安全规则 firestore.rules   ← 所有客户端读写的最终裁决
Storage   安全规则 storage.rules     ← 商品图片/视频，仅超级管理员可写
Cloud Functions functions/           ← 员工身份类操作（Admin SDK），客户端无权直接执行
                                     ← onInquiryCreated：询价自动关联/新建客户档案 + 群机器人通知
                                     ← onQuotationCreated：累加客户「累计报价」
```

### 业务数据流（联动关系）

```
官网询价 / 后台手动录入 ──► inquiries（assignedStaffId: '' = 公海）
        │                         │ onInquiryCreated（服务端）
        │                         ├─► customers/{CUST-…}：按 买家uid > 手机号 > 邮箱 匹配，inquiryCount +1
        │                         ├─► inquiries.customerId 回填
        │                         └─► 企业微信/钉钉群机器人通知（配置 NOTIFY_WEBHOOK_URL 时）
        ▼
指派 / 认领 ──► 跟进记录（只追加）──► 报价单 quotations（同一单号只开具一次）
                                           ├─► 线索：估值 = 报价总额、阶段 → 已报价、自动跟进记录
                                           └─► onQuotationCreated：customers.totalQuotationUsd += 报价总额
买家「我的询价」进度 = 由线索 stage 推导（待受理 / 跟进中 / 顾问已联系）
```

### 权限模型（规则、Functions、前端三处一致）

* **员工身份只认 `staff/{uid}` 文档**：存在且 `status == 'active'` 才是员工，`role` 决定是否超级管理员。
  Custom Claims 只作前端提示，**永不参与授权**——停用、降级、删除档案后立即失效。
* `staff` 文档的创建、删除，以及 `role` / `status` 的修改只能由 Admin SDK（Cloud Functions 或脚本）完成，
  保证 Firebase Auth 账号、Claims、员工档案三者始终同步。
* 销售代表只能**读取**和处理公海或自己名下的线索（查询 `assignedStaffId in ['', 自己uid]`），
  只能把线索认领给自己或退回公海，跟进记录只能追加；报价单只能看自己开的。
* 商品、站点联系方式、报价单收款账户（`site_config/billing`，仅员工可读）、客户档案、审计日志、删除线索、管理员工仅限超级管理员；后台标签页按角色显示（`src/config/adminTabs.ts`）。

### 配置单一来源

| 值 | 定义位置 | 需同步的副本（有测试校验） |
|---|---|---|
| Firestore 命名数据库 ID | `firebase-applet-config.json` | `firebase.json`、`storage.rules`、`functions/src/index.ts` |
| 员工登录邮箱域名 | `src/config/appConfig.ts` | `functions/src/index.ts` |
| Cloud Functions 区域 | `src/config/appConfig.ts`（`FUNCTIONS_REGION`） | `functions/src/index.ts` |

## 本地开发

```bash
npm install
npm run dev
```

## 测试

```bash
npm test               # 静态契约测试：规则 ↔ blueprint ↔ sanitizer 字段一致、配置一致性
npm run test:emulator  # 在 Firestore 模拟器中真实执行安全规则（需要 Java 11+）
```

CI 中请务必运行 `npm run test:emulator`；未设置模拟器时行为测试会被跳过并打印警告。

## 部署

完整的上线步骤、上线前必须由业务方确认的内容、以及中国大陆访问说明，见 **[DEPLOY.md](DEPLOY.md)**。

简要顺序：本地构建与测试 → 部署规则与索引 → 部署 Functions（Node 22）→ 初始化超级管理员 → 部署 Hosting → 在中台填写官网联系方式和报价单收款账户 → 冒烟测试。

## 依赖说明

根目录 `firebase-admin`（^14，仅供 `scripts/` 使用）与 `functions/` 中的 `firebase-admin`（^12）是两个独立安装，
后者需与 `firebase-functions@6` 的 peer 依赖保持兼容，升级时请两边分别验证。
