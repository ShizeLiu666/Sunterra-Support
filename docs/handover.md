# Sunterra Support — Project Handover

> Last updated: 2026-06-09
>
> Current active work branch: `milestone-2`
>
> This file is the first document a new agent should read before touching this
> repository. It records current branch state, production risk, strict v1.1 URL
> rules, local dev commands, and remaining work.

## AGENT MUST-READ 速览

- 🔴 `main` = production. It deploys to `https://support.sunterra.com.au/` and
  is in gray rollout with real users. Do not directly edit, merge, or push
  `main` unless the user explicitly asks for a production hotfix/deploy.
- 🔴 Local dev must use Node 20.19.5 first in `PATH`, skip PostCSS fallbacks in
  dev, and force webpack:

  ```bash
  export PATH="$HOME/.nvm/versions/node/v20.19.5/bin:$PATH"
  POSTCSS_SKIP_FALLBACKS=1 npx next dev --webpack
  ```

  Do not rely on plain `npm run dev` for local diagnosis; it can hit
  `ERR_REQUIRE_ESM` in the dev PostCSS path.
- 🔴 Current branch is `milestone-2`. It is the strict spec v1.1 terminal
  version. Before changing signing/verification, read
  `docs/integration-spec.md` and `tests/hmac.spec.ts`.
- 🔴 Work in small steps. Before code changes, inspect the existing code and
  explain the plan. After changes, show `git diff`. Do not commit or push
  unless the user explicitly asks.
- 🔴 Never expose Salesforce credentials or HMAC secrets. `.env.local` is local
  only and must not be committed.

## Current Branch / Deployment State

### `main` — Production

- Production URL: `https://support.sunterra.com.au/`.
- DNS cutover is complete. Old notes saying DNS is pending are historical.
- Real users may be using production during gray rollout.
- `main` includes two recent production hotfixes:
  - Field length / overflow fix for `Name`, `Email`, `Address` display and
    input limits.
  - Description limit increased from 500 to 1000 chars.
- Production deploy status after the Description hotfix was successful.

### `milestone-2` — Preview / Strict v1.1

- `milestone-2` is synced to `origin/milestone-2` at the strict v1.1 signature
  implementation.
- Preview branch alias:

  ```text
  https://sunterra-support-git-mil-b4373a-liushize0408-gmailcoms-projects.vercel.app/
  ```

- `milestone-2` is not yet production. It contains strict v1.1 behavior and
  extra form/confirmation UX not present on `main`.
- Preview 环境已设置 `ENABLE_SOSL_JOB_LOOKUP=true`(Vercel scope=Preview),用于
  SN→Job__c 匹配调试;`main`/生产未启用(milestone-2 单 SN 适用,main 多 SN
  不可开)。将来 `milestone-2` 合并上线前需重新评估 `main` 的 SN 匹配策略。

## What This Project Is

Sunterra is an Australian solar installer. Customers enter this support form
from Growatt ShinePhone App via a signed deep link. The app lets the customer
confirm contact/installation details, choose a problem type, describe the issue,
optionally upload photos, and submit a support ticket.

The server creates a Salesforce `Customer_Care__c` record. Salesforce object
labels can be misleading:

- Support ticket object: `Customer_Care__c`.
- Installation object: `Job__c` (label: Installation).
- `Customer_Care__c.Job_Number__c` is a lookup to `Job__c`.

## Tech Stack / Build Rules

- Next.js `16.2.6` App Router.
- React `19.2.4`.
- TypeScript strict.
- Tailwind CSS v4.
- Salesforce REST API via OAuth Client Credentials.
- HMAC-SHA256 using Node `crypto`.
- Vercel deployment.

Important build/runtime decision:

- Use webpack, not default Turbopack, for production build and reliable old
  WebView compatibility.
- `package.json` has:

  ```json
  "build": "next build --webpack"
  ```

- Local dev should use:

  ```bash
  export PATH="$HOME/.nvm/versions/node/v20.19.5/bin:$PATH"
  POSTCSS_SKIP_FALLBACKS=1 npx next dev --webpack
  ```

Why:

- Node 24 + Next 16/React 19 caused local build/dev instability.
- Dev with the full PostCSS fallback chain can hit ESM/CJS issues; use
  `POSTCSS_SKIP_FALLBACKS=1` locally.
- Webpack is required because Turbopack did not reliably honor the browser
  targets needed for older Android/ShinePhone WebViews.

## Environment State

Local `.env.local` currently points to the test sandbox:

```text
SALESFORCE_INSTANCE_URL=https://sunterra--test.sandbox.my.salesforce.com
SALESFORCE_LOGIN_URL=https://test.salesforce.com
SALESFORCE_API_VERSION=v62.0
NODE_ENV=development
```

Production Vercel environment points to Salesforce production:

```text
SALESFORCE_INSTANCE_URL=https://sunterra.my.salesforce.com
```

Never paste real secrets into docs or chat. Only variable names and environment
purposes belong in documentation.

## Strict v1.1 URL / Signature State

`milestone-2` implements strict v1.1. See `docs/integration-spec.md` for the
full contract. Summary:

- Required URL keys:
  `email`, `name`, `address`, `sn`, `deviceType`, `deviceModel`, `timestamp`,
  `sign`.
- Final URL display order:
  `email -> name -> address -> sn -> deviceType -> deviceModel -> timestamp -> sign`.
- HMAC input order is different: all fields except `sign`, sorted by field
  name ascending.
- HMAC input uses raw values, not URL-encoded values.
- Empty `email=`, `name=`, `address=` are kept and signed as `key=`.
- `sn`, `deviceType`, `deviceModel`, `timestamp`, and `sign` must be non-empty.
- `deviceType` must be `inverter` or `battery`.
- `sn` is exactly one selected problem-device SN. `milestone-2` does not keep
  legacy multi-SN compatibility.

Implementation notes:

- `lib/hmac.ts` signing algorithm was not changed during v1.1 work; it was
  already dynamic and correct.
- `tests/hmac.spec.ts` locks the spec worked example and empty-value example.
- `lib/token.ts` enforces strict v1.1 required key/value rules.
- `/api/submit` re-verifies by forwarding all received signed params
  generically instead of rebuilding a hard-coded whitelist.
- `components/support-app.tsx::readTokenFromUrl()` also forwards all URL params
  generically so submit-time re-verification receives the exact signed set.

## Completed on `milestone-2`

User-facing form/UX:

- Confirmation/review view before final submit.
- Mobile number field.
- Client validation for Name, Email, Mobile, Address, Problem type,
  Description.
- Server-side required enforcement for Email and Mobile.
- Required-field asterisks dynamically show green when valid and red when
  invalid/empty.
- Review button reveals errors and scrolls/focuses the first invalid field.
- Description limit increased to 1000 chars.
- Long Name/Email/Mobile/Address values are length-capped and protected from
  horizontal overflow.
- Confirm view shows full Description text.
- Confirm view shows real signed `deviceType` / `deviceModel` values from the
  URL. These are display-only.

Strict v1.1/signature:

- 8-key strict URL verification.
- `deviceType` enum validation.
- `deviceType` / `deviceModel` parsed into `InstallationData` / `UrlParams`.
- `/api/submit` generic signed-param forwarding to avoid future
  `invalid_signature` bugs from dropped fields.
- `tests/hmac.spec.ts` added as a Playwright unit project for HMAC canonical
  string regression coverage.

Salesforce/device caveat:

- Salesforce `Customer_Care__c` currently has no device fields.
- Do not write `Device_Type__c` or `Device_Model__c` unless Salesforce fields
  are created first; posting unknown fields will 400.

## Production Hotfixes Already on `main`

`main` is production and already includes:

- `fix: cap Name/Email/Address length and prevent overflow`
  - Caps Name/Email/Address lengths.
  - Prevents long unbroken text from overflowing the info card.
- `feat: increase description limit to 1000 chars`
  - Changes Description max length from 500 to 1000.
  - Updates warning/danger thresholds to 900/980.

Do not assume `main` has milestone-2 features. It does not have strict v1.1
confirmation-flow work unless explicitly merged later.

## Salesforce Notes

Key object/field facts:

- `Customer_Care__c` is the support ticket object.
- `Job__c` is the installation object.
- `Customer_Care__c.Job_Number__c` is a lookup to `Job__c`.
- `Job__c.Inverter_Battery_Serials__c` is Long Text Area, so it cannot be used
  in SOQL `WHERE`.
- SOSL is required for SN search:

  ```text
  FIND {<SN>} IN ALL FIELDS RETURNING Job__c(Id, Name) LIMIT 5
  ```

- Known test sandbox match:
  - `NTCIA01092` -> `Job__c` `JOB-08973` (`a000I000025xiMxQAI`).

Production layout/status:

- `Customer_Name__c` has been added to the production layout.
- Keep `Case_Origin__c = Web` unless the user explicitly asks to change origin
  behavior and Salesforce picklist values are verified.

## Outstanding Work / TODO

High priority:

- Enable `ENABLE_SOSL_JOB_LOOKUP=true` in the relevant environment when ready.
- Improve matching logic for v1.1 selected-device SN:
  - For strict v1.1, use the single selected `sn`.
  - If any legacy/multi-SN path is reintroduced later, search individual SNs
    and only populate `Job_Number__c` when the result is unambiguous.
- Run real ShinePhone WebView validation with Growatt's v1.1 link.
- Verify Preview behavior with production-like v1.1 signed URLs before merging
  milestone-2 to production.

Salesforce/admin:

- Add device fields to `Customer_Care__c` if Sunterra wants to store
  `deviceType` / `deviceModel` in Salesforce. Until then, they are display-only.
- Keep monitoring whether production layout fields are visible to support staff.

Security/ops:

- Plan HMAC secret rotation with Growatt. Current implementation assumes a
  single shared secret.
- Keep secrets out of docs, chat, client code, and git history.

Local dev/build:

- Standardize local Node on `v20.19.5`.
- Avoid Node 24 for this project until Next/React local build issues are
  resolved.
- Consider updating `package.json` dev script later to encode the safe dev
  command, but do not change it without user approval.

Testing/docs:

- Keep `tests/hmac.spec.ts` green after any signature change:

  ```bash
  PW_SKIP_WEBSERVER=1 npx playwright test --project=unit
  ```

- Update this handover and `docs/integration-spec.md` before declaring future
  signing or deployment changes complete.

## Known Issues / Tech Debt

## UI 测试套件 stale（68 failing，2026-07-14 记录）

**现状：** tests/ui.spec.ts、interaction.spec.ts、responsive.spec.ts、
webview.spec.ts 共 68 条失败，全部是既有 stale，非代码 bug。
unit 层（hmac.spec.ts + token.spec.ts）41/41 绿，不受影响。

**三处根因 drift：**
- radio 文案：测试断言 `System not working` / `Warning or error` / `Battery issue`；
  现行 PROBLEM_TYPES 为 `Battery Issue` / `Inverter Issue` / `App Monitoring` / …
- 字数计数器：测试断言 `/500`；代码 MAX_DESCRIPTION_LENGTH = 1000
- dev fallback 数据：测试断言 `12 Pine Street, Adelaide SA 5000`；
  代码为 `123 Solar Ave, Adelaide SA 5000, Australia`（含 SN、型号也不符）

**结构性问题：** 约 70% 的 expect() 绑定精确文案或数量，且 ×6 个 device project
fan-out，导致 3 处内容改动放大成 68 条红。测试保护的是像素级文案，
不保护真正会变的逻辑（契约校验、SF 写入、幂等）。

**处理计划（milestone-2 合并进 main 之后再做）：**
- 保留：responsive.spec.ts 的结构性断言（无横向溢出）
- 保留并加强：webview.spec.ts —— 这是唯一覆盖 ShinePhone WebView UA 的测试，
  而 WebView 兼容性是本项目历史上最大的风险源，不可删除
- 重写：把「能填表、能提交、成功页出现」这条主流程改用 data-testid 定位，
  不再依赖精确文案
- 删除：toHaveCount(N)、精确文案 getByText、字数计数器断言等易变噪音
- 目标：UI 测试瘦身为结构/可达性冒烟；验证价值继续压在 unit 层

**为什么不现在做：** UI 测试清理会碰 components/*，而那正是 milestone-2
合并 main 时的 4 个冲突文件所在。合并后在统一分支上做一次即可。

### deviceType 大小写敏感（契约脆弱点）

lib/token.ts:58 的 ALLOWED_DEVICE_TYPES 是全小写 Set，
`INVERTER` / `Inverter` 会被判 malformed。
spec v1.1 §3.2 约定小写，当前实现正确。
风险：若 Growatt 客户端传大写，会被静默拒收，只有查 Vercel logs
（reason=malformed cause=device_type_enum）才能定位。
待办：与 Growatt 明确大小写约定；若对方无法保证，再考虑 .toLowerCase() 归一。
**此项在 Growatt 开发启动前必须确认。**

### TokenVerificationResult 不是判别联合

types/installation.ts:73-77 是扁平 { valid: boolean; reason?; data? }，
导致 if (result.valid) 无法收窄 data，所有消费者需用 result.data! 强断言。
改成 { valid: true; data } | { valid: false; reason } 可让编译器保证类型安全。
待办：随「字段单一真相源」重构一起做。

## Key File Map

```text
app/
  page.tsx                    Server entry; verifies URL token and renders SupportApp.
  expired/page.tsx            Token failure page.
  success/page.tsx            Post-submit page.
  api/submit/route.ts         Re-verifies token and creates Customer_Care__c.

components/
  support-app.tsx             Client wrapper; token forwarding and lifted form state.
  installation-info.tsx       Editable customer/contact/installation info.
  ticket-form.tsx             Problem type, description, photos, confirm view, submit.
  brand-header.tsx            Sunterra header.

lib/
  env.ts                      Lazy env validation.
  hmac.ts                     HMAC canonical string + signature helpers.
  token.ts                    URL verification and strict v1.1 validation.
  salesforce.ts               OAuth, Customer_Care__c creation, photo upload, SOSL helper.
  validation.ts               Shared field validators.

types/
  installation.ts             InstallationData / UrlParams / token result types.

tests/
  hmac.spec.ts                Spec v1.1 HMAC canonicalization unit tests.

docs/
  integration-spec.md         Strict v1.1 URL/signature contract.
  handover.md                 This file.
  project-overview.md         High-level business overview.
```

## Working Mode for Future Agents

- Start every task by checking branch and status.
- Do not assume Desktop clone and code clone are the same. Recent active work
  used `/Users/liushize/code/Sunterra-Support` because it has `milestone-2`.
- Prefer reading existing local patterns before editing.
- Keep changes tightly scoped to the user's request.
- Show diff before commit when the user asks for staged review.
- Do not push to `main` unless the user explicitly asks and production risk is
  understood.

## Historical Notes

Older handover sections from 2026-05-24 to 2026-06-01 mentioned:

- DNS cutover pending from `sunterra-support.vercel.app` to
  `support.sunterra.com.au`.
- `.env.local` temporarily pointing at production.
- Turbopack as the default tech stack.
- Growatt contract still missing required SN fields.

Those notes are historical and no longer describe the current state. The
current production URL is `https://support.sunterra.com.au/`, local `.env.local`
points at the test sandbox, and strict v1.1 is documented in
`docs/integration-spec.md`.
