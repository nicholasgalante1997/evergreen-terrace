# agent-os-domain

Domain knowledge for agent-os — Charter Communications' telecom SaaS employee dashboard. This is the primary application that Springfield analyzes and that the agent-tools team supports.

Read this before working on any task that involves agent-os feature areas, domain terminology, or the business context behind the technical work.

---

## What agent-os Is

agent-os is Charter's internal SaaS dashboard for customer service agents (CSRs). It's a large enterprise microfrontend (MFE) system — dozens of independently deployed feature packages that compose into a unified agent workspace.

CSRs use it to handle customer interactions: billing inquiries, service orders, troubleshooting, account management, and more. The system is mission-critical — downtime or degraded performance directly impacts customer service capacity.

---

## Technology Context

- **Frontend:** React-based MFE architecture. Multiple teams own individual feature packages.
- **Design system:** Fidget/Kite (see `skills/fidget-context/`). Adoption tracking is a core Springfield use case.
- **MUI:** Material UI is the legacy component library being migrated away from. Springfield tracks MUI usage to measure migration progress.
- **Deployment:** GitLab CI/CD via Spectrum Flow (SF2). See `@cde/hiro` registry for SF2 skills.

---

## Feature Domain Map

These are the 67 domain areas Springfield tracks, organized by business function:

**Account & Identity**
- `account` — Customer account management
- `account-memo` — Account notes and memos
- `identity` — Identity verification and authentication
- `customer-qualification` — Customer eligibility and qualification flows

**Billing & Payments**
- `billing` — Billing inquiries, statements, adjustments
- `payments` — Payment processing and history
- `bad-debt` — Bad debt management and collections
- `agreement` — Service agreements and contracts

**Orders & Services**
- `ordering` — Service order creation and management
- `orders` — Order history and status
- `shipments` — Equipment shipment tracking
- `entitlements` — Service entitlements and provisioning

**Technical Support**
- `troubleshooting` — Guided troubleshooting workflows
- `disconnects` — Service disconnect handling
- `internet-assist` — Internet service assistance
- `mobilediagnostics` — Mobile device diagnostics
- `device` — Device management and support

**Communication**
- `call` — Call handling and CTI integration
- `email` — Email communication tools
- `comm-preferences` — Customer communication preferences
- `phonenumber` — Phone number management

**Customer Interactions**
- `customer-interactions` — Interaction history and notes
- `case-management` — Case creation and tracking
- `singlecustomerincident` — Single customer incident management
- `alert` — Alert display and management
- `alert-definition` — Alert configuration

**Content & Knowledge**
- `content` — Content management and display
- `knowledge` — Knowledge base integration
- `journal` — Agent journal and notes

**Analytics & Reporting**
- `analytics` — Usage analytics and reporting
- `gmat` — GMAT (performance metrics)
- `eventboard` — Event tracking and display

**Mobile & Location**
- `mobile` — Mobile service management
- `location` — Location-based services
- `dispatch` — Field dispatch management

**Specialized Features**
- `ppv` — Pay-per-view management
- `competitive-edge` — Competitive intelligence tools
- `agent-assist` — AI-assisted agent guidance
- `agent-os-companions` — Companion tools and utilities
- `tools` — General agent tools
- `util` — Shared utilities
- `ui` — Shared UI components

**Infrastructure & Platform**
- `react` — Shared React utilities and patterns
- `web-api-client` — API client utilities
- `domain-event` — Domain event handling
- `bridge` — Cross-package communication bridge
- `vendor` — Third-party vendor integrations
- `gateway-theme` — Gateway/portal theming
- `dark-fidget-theme` — Dark mode theme implementation
- `fidget` — Fidget design system integration layer
- `mui` — MUI component usage (legacy, being migrated)

---

## Key Business Concepts

**CSR (Customer Service Representative):** The primary user of agent-os. Their efficiency directly impacts customer satisfaction scores and handle time metrics.

**Handle Time:** The time a CSR spends on a customer interaction. Reducing handle time is a primary product goal — every second saved at scale is significant.

**MFE (Microfrontend):** Each domain area is a separately deployed package. Teams own their packages independently. This is why dependency tracking (Springfield's core function) matters — a breaking change in a shared component can cascade across dozens of packages.

**Fidget Adoption:** Charter is migrating from MUI to the Fidget design system. Springfield tracks which components have been migrated and which haven't. This is a multi-year effort.

**Spectrum Flow (SF2):** The CI/CD platform. GitLab-based. See the `specflow` namespace in `@cde/hiro` for SF2-specific skills and agents.

---

## What Springfield Provides About agent-os

Springfield's dump directory (`core/springfield-dump/dump/`) contains per-domain analysis:

- **Component inventory** — every React component in every domain package
- **Fidget adoption** — which Fidget components are used where
- **MUI usage** — remaining MUI component usage by domain
- **Internal dependencies** — which packages depend on which
- **External dependencies** — third-party library usage
- **React attributes** — prop usage patterns across components
- **React orphans** — components with no consumers

This data is the foundation for migration planning, dependency impact analysis, and design system adoption reporting.

---

## Constraints

- **Do not make changes to agent-os directly** — it's a separate codebase owned by multiple teams
- **Springfield is read-only from evergreen-terrace** — use its MCP server to query data, never write to it
- **Domain terminology matters** — use the correct domain names when referencing feature areas; "billing" and "payments" are distinct domains
