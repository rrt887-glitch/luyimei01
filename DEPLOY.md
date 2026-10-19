# 上线手册

按顺序做完本文的「一」到「五」，网站就可以正式对外。每一步都写明了在哪里操作、怎样算完成。

---

## 一、上线前必须由你确认或提供的内容

这些内容代码无法替你决定。它们会直接显示给客户，或印在报价单上，写错的后果比不写更严重。

| # | 内容 | 现在的情况 | 在哪里改 |
|---|---|---|---|
| 1 | **报价单收款账户** | 未填写。报价单上会写「Bank details will be provided separately」，不会出现任何账号 | 上线后用超级管理员登录中台 →「经营概览」页底部「报价单收款账户」 |
| 2 | **官网联系方式** | 默认值是代码里的示例：企业微信 `LYM-Engineering-GZ`、邮箱 `business@luyimei.com`，电话和 WhatsApp 为空。请确认 `luyimei.com` 这个域名的邮箱确实归你们所有 | 中台 →「经营概览」→「官网联系方式」 |
| 3 | **首页四项数据**：注册资本 2,670 万元、常备现货 500+ 吨、13 项专利、7×24 小时应急响应 | 来自原始代码，我无法核实 | `src/components/sections/HeroSection.tsx`（数字）；研发区的「13」在 `EngineeringSection.tsx` |
| 4 | **服务承诺**：「工程顾问 2 小时内回复」「7×24 小时有人值守」 | 来自原始代码 | `src/i18n/locales/zh.ts`（`contact.titleSub`、`submitSuccess`）和 `ContactSection.tsx` |
| 5 | **4 款默认商品**的价格、起订量、产能（如「月产 800 吨」）、交期 | 来自原始代码 | 中台「商品库」直接改（推荐），或 `src/data/products.ts` |
| 6 | **公司地址** | 页脚写「广州高新技术产业开发区中新知识城智造产业园」，报价单写「Huangpu District, Guangzhou」 | 页脚 `Footer.tsx`，报价单 `QuotationView.tsx`，搜索引擎信息 `index.html` |
| 7 | **网站图片** | 全部 6 张图片看起来是 AI 生成的。首屏原图的设备上印着美国同行品牌 **CRAFCO** 的标志，本版已从图中抹掉；但画面里仍是美国公路标牌（Route 15、限速 65） | 换成公司真实的施工、产品、实验室照片，**文件名保持不变**直接覆盖 `src/assets/images/` 下的文件即可。建议宽度 1600px 左右 |

第 3、4、5 项涉及对外宣传。如果与事实不符，可能构成虚假宣传，请务必逐条核对。

---

## 二、Firebase 控制台的一次性设置

项目 ID：`gen-lang-client-0359861747`（已写入 `.firebaserc`）。

1. **计费方案**：Cloud Functions 需要 Blaze（按量付费）方案。升级后请在 Google Cloud 控制台 →「结算」→「预算和提醒」设置月度预算提醒，例如 50 美元。
2. **Authentication**
   - 「登录方法」中启用「电子邮件/密码」。
   - 「设置」中升级到 **Identity Platform**。阻止员工域名被外部注册的函数依赖它；不升级，部署 Functions 会失败。
   - 「设置 → 已获授权的网域」中加入你的正式域名（例如 `www.luyimei.com`）。**不加，正式域名上的所有登录都会失败。**
3. **确认 Firestore 数据库的位置**：Firestore →「数据库」→ `ai-studio-e08ae01c-…`，查看「位置」。
   - 如果是 `nam5` 或 `us-central1`：无需改动。
   - 如果是其他位置：把 `src/config/appConfig.ts` 和 `functions/src/index.ts` 中的 `FUNCTIONS_REGION` 改成对应区域（`eur3` 对应 `europe-west1`，单区域则填同一区域），两处必须一致，测试会检查。
4. **（建议）新询价群通知**：在 `functions/.env` 写入企业微信或钉钉群机器人地址：
   ```
   NOTIFY_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx
   ```
5. **（建议，可上线后再做）App Check 防刷**
   1. 在 Google reCAPTCHA 后台创建 v3 密钥，域名填正式域名。
   2. 在 `.env` 写入 `VITE_RECAPTCHA_SITE_KEY=…`，重新构建并部署 Hosting。
   3. 在 Firebase 控制台 → App Check 观察几天，确认正常请求都带有有效令牌后，再为 Firestore、Storage、Functions 打开「强制执行」。**顺序不能反**，否则所有访客都会被拦截。

---

## 三、本地构建与测试（本次修改所在的环境无法安装依赖，这一步必须由你执行）

需要 Node.js 22 和 Java 11 以上（模拟器测试用）。

```bash
npm install
npm run lint          # TypeScript 类型检查，应无错误
npm test              # 规则、数据结构、配置一致性的静态测试
npm run test:emulator # 在 Firestore 模拟器里真实执行全部安全规则
npm run build         # 产物在 dist/

cd functions && npm install && npm run build && cd ..
```

以上任何一步报错，都先不要上线，把报错内容发给我。

---

## 四、部署

```bash
npx firebase-tools login

# 1. 仅当数据库里已经有旧数据时执行（全新上线可跳过）
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
npm run cleanup:legacy             # 预览要改哪些数据
npm run cleanup:legacy -- --apply  # 确认无误后执行

# 2. 安全规则、索引、存储规则
npx firebase-tools deploy --only firestore,storage
#    部署后到 Firestore →「索引」确认状态从「正在构建」变为「已启用」（几分钟）

# 3. Cloud Functions（Node 22）
npx firebase-tools deploy --only functions

# 4. 第一位超级管理员（只做一次；需要第 1 步里的服务账号密钥环境变量）
#    服务账号密钥：Firebase 控制台 → 项目设置 → 服务账号 → 生成新的私钥。用完妥善保管，不要提交到代码仓库。
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
npm run init:admin -- --email="你的邮箱" --phone="你的手机号" --name="你的名字" --password="至少8位强密码"

# 5. 网站
npm run build
npx firebase-tools deploy --only hosting
```

部署完成后：

0. **确认注册验证码服务已上线**（注册页的图片验证码由 Cloud Function `getSignupCaptcha` 生成，没部署就会显示「注册服务暂时连不上」）：
   在浏览器打开 `https://us-central1-gen-lang-client-0359861747.cloudfunctions.net/getSignupCaptcha`。
   - 看到一段含 `Bad Request` 的 JSON：已部署，正常（浏览器直接打开就是这个结果）。
   - 看到 `404` 页面：函数还没部署，执行 `npx firebase-tools deploy --only functions`。
   - 打不开：当前网络访问不了 Google 服务（中国大陆需要能访问 Google 的网络，见第六节）。

1. **绑定正式域名**：Firebase 控制台 → Hosting →「添加自定义网域」，按提示在域名服务商处添加 DNS 记录，HTTPS 证书会自动签发。
2. **社交分享图**：把 `index.html` 中的 `og:image`、`twitter:image` 改成完整地址，例如 `https://www.luyimei.com/og-image.jpg`，再部署一次 Hosting。
3. 登录中台，填写**官网联系方式**和**报价单收款账户**（第一节第 1、2 项）。

---

## 五、上线后冒烟测试（约 20 分钟）

用手机和电脑各走一遍：

- [ ] 首页打开正常，首屏有密封胶沿裂缝灌入的动画；切换四种语言都正常
- [ ] 用一个新邮箱注册买家：填写图片验证码后注册成功并自动登录；故意填错一次，会提示错误并自动换一张新图；中台「客户档案」出现这个买家，WhatsApp 带国际区号
- [ ] 中台「商品库」→「管理分类」新增一个分类并保存 → 官网顶部「产品」菜单、产品目录分类、页脚、供货信息表都出现它；把一款商品移进去，再删掉这个分类（选择移回原分类）
- [ ] 官网切换到 English：首页供货信息表的交期、起订量、产能、基地都是英文；打开任一产品弹窗，按 Esc 能关闭
- [ ] 在官网提交一条询价 → 群机器人收到通知 → 中台「商机线索」公海里出现这条，「客户档案」自动建档
- [ ] 中台给这条线索指派销售、改阶段、写一条跟进记录
- [ ] 开一张报价单：底部显示你填的收款账户；下载 PDF 正常；「打印」能另存为 PDF；客户档案的「累计报价」增加
- [ ] 开通一个销售账号，用它登录：只能看到 4 个页面，看不到客户档案和操作日志，也看不到同事的线索
- [ ] 停用这个销售账号 → 对方立即无法再读写任何数据，再次进入中台会被拦截
- [ ] 商品库改一个价格 → 官网产品目录马上变化
- [ ] 浏览器开发者工具 → Console 没有红色报错；Network 中没有 4xx/5xx 请求
- [ ] 用 [securityheaders.com](https://securityheaders.com) 检查正式域名，应能看到 HSTS、X-Frame-Options、X-Content-Type-Options 等安全头

**内容安全策略（CSP）**：目前以「只报告、不拦截」的方式启用（`Content-Security-Policy-Report-Only`）。上线一两周后，如果浏览器 Console 中没有 CSP 违规提示，可把 `firebase.json` 中的 header 名改为 `Content-Security-Policy`，正式开启拦截。

**出问题时回滚**：Firebase 控制台 → Hosting →「版本历史」，可一键回滚到上一版网站；安全规则在 Firestore →「规则」→「历史记录」中回滚。

---

## 六、中国大陆访问（重要，需要你做业务决定）

本项目的后端全部在 Google Firebase 上，而 Google 服务在中国大陆无法稳定访问。具体影响如下：

| 功能 | 海外访客 | 大陆访客（无 VPN） |
|---|---|---|
| 打开网站 | 正常 | Firebase 默认域名（`*.web.app`）被屏蔽；绑定自定义域名后能否打开取决于线路，**不保证** |
| 产品目录 | 实时数据 | 显示代码内置的 4 款产品（已做降级处理） |
| 提交询价 | 正常 | 8 秒后提示「暂未送达，已保存在本机」，并给出电话、微信、邮件直连方式（已做降级处理） |
| 买家登录、收藏 | 正常 | 不可用 |
| 员工中台 | 正常 | 不可用。在大陆办公的员工需要稳定的国际网络 |

可选方案：

1. **按现状上线**：网站主要面向海外买家，国内客户通过电话和微信联系。成本最低，今天就能上线。
2. **静态网站放国内**：网站托管在国内 CDN（需要 **ICP 备案**，通常 1–3 周），询价表单改接国内云服务（例如腾讯云 CloudBase）。国内访问稳定，但需要改造架构，工作量较大。

如果主要客户在国内，建议选方案 2，我可以协助规划改造。

---

## 七、已经在代码里处理好的上线事项（供核对）

- Cloud Functions 已升级到 Node.js 22。Node 20 将于 **2026-10-30** 被 Google 停用，届时无法再部署或更新。
- Functions 区域固定为 `us-central1`，前后端一致；单个函数最多 10 个实例，防止被刷时费用失控。
- Hosting 已配置：单页应用路由、静态资源长期缓存、`index.html` 不缓存、HSTS、防点击劫持、防 MIME 嗅探、Referrer 和 Permissions 策略、CSP（只报告模式）。
- 网站图标、iOS 主屏图标、社交分享图（1200×630）、`robots.txt`、`noscript` 提示。
- 图片总体积从 5.6 MB 压缩到约 1.3 MB，尺寸不变。
- 全局错误兜底：页面出错时显示「刷新」提示而不是白屏；发布新版后，旧页面加载不到旧代码文件时会自动刷新一次。
- 报价单收款账户可在中台配置，只有员工能读取；未配置时报价单不会出现任何账号。
- 买家注册必须通过图片验证码：浏览器端直接创建账号会被 `beforeAccountCreated` 拦截，账号、买家档案和客户档案由 `registerBuyer` 在服务器端一起创建。验证码图片由服务器用线条绘制（网页源码里没有答案文字），答案只存哈希值，5 分钟有效、只能用一次；同一 IP 每 10 分钟最多获取 30 张。
- （可选）在 Google Cloud 控制台 → Firestore →「TTL」为集合 `signup_captchas` 的 `expireAt` 字段开启 TTL 策略，过期验证码会被自动清理。
