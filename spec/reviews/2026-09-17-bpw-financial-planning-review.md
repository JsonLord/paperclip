# BPW Financial Planning Review — 2026-09-17

## Native system and canonical content

FounderOS registers `bpw-financial-planning` as the native **Financial Planning** Project and instantiates `compile-bpw-financial-plan` after an accepted evidence-backed BMC. The finance owner role reuses an existing Finance/Financial Case Agent. Native Issues define drivers, compile revenue/cost/staffing, build P&L and cash flow, calculate capital requirement, propagate scenarios, validate market/capacity, and render the BPW artifact when possible.

The Goal and `bpw.finance` resource pack preserve canonical `bpw-financial-planning`, `bpw-finance`, `bpw-business-model-canvas`, and evidence-discipline identifiers. The original BPW workbook is not present in this repository. FounderOS therefore does not guess sheets or legacy XLS cells: it implements the canonical domain model and a versioned mapping/renderer boundary, reports `NOT_RENDERED`, and keeps YAML authoritative.

## Downstream evidence contract

The plan consumes Unit Economics, Financial Case, registered scenarios/assumptions, and the Business Model Canvas. Historical values remain `OBSERVED` or `CALCULATED` with their lower-level measured/allocated/estimated classification, sources, and formulas. Forecast rows remain `FORECAST`. The financial plan adds time; it does not recompute a competing economic truth.

## Horizon, assumptions, and driver model

Forecast horizons explicitly retain start/end periods, monthly or annual granularity, and template/version. Durable assumptions retain ID, driver, description, value/range, units, period, start period, source IDs, basis, confidence, scenario, sensitivity, and status. Unresolved assumption sources, invalid ranges, missing salaries, and unknown operating-expense values fail deterministic validation rather than becoming hidden spreadsheet constants.

Revenue follows the selected one-time, subscription, usage, service, pilot, license, project, or hybrid model. Customer roll-forward separates new, retained, active, and churned customers. Revenue uses explicit customer, price, and renewal drivers. Variable costs and support demand scale from the same active-customer state, so scenarios cannot change revenue without propagating cost and capacity.

## Staffing, operating cost, P&L, and investment

Staffing retains role, start period, FTE, salary, additional-cost basis, sources, and justification; current staff and planned hires are not conflated. Operating expense and CAPEX categories appear only when supplied. P&L deterministically derives revenue, variable costs, gross contribution, personnel, operating expense, operating result, and—only with an explicit rate—tax and net result. Missing tax/legal treatment remains unknown.

## Cash flow, liquidity, capital, and financing

Cash receipts honor explicit payment delay, while expenses, payroll, tax, and investments retain their timing. Each period rolls opening cash, confirmed inflows, outflows, net cash flow, and closing cash. Planned/hypothesized grants, loans, equity, or founder funding are excluded from received cash. Capital requirement is derived from the minimum modeled cash plus an explicit safety buffer. Unknown opening cash leaves capital requirement constrained/unknown rather than inventing liquidity.

## Scenarios, sensitivity, market, and capacity

Conservative/base/upside scenarios vary only registered assumptions and enforce documented ranges. Customer changes flow consistently into revenue, variable cost, support demand, P&L, and cash. Deterministic sensitivity ranks effects on closing cash and capital requirement. Forecast customer totals reconcile to reachable market; new-customer volume reconciles to observed sales capacity; support hours reconcile to staffed delivery capacity. Infeasible plans fail before Hermes even when their arithmetic is internally consistent.

## Outputs, Firm, Hermes, and staleness

Canonical outputs include `FINANCIAL_PLAN.yaml`, `PROFIT_AND_LOSS.yaml`, `CASH_FLOW.yaml`, `CAPITAL_REQUIREMENT.yaml`, `FINANCIAL_ASSUMPTIONS.yaml`, `FINANCIAL_RISKS.md`, and `FINANCIAL_PLAN.md`. Risks link evidence/assumptions, impact, and a registered validation Goal. A rendered workbook is a presentation Work Product and must reconcile to canonical totals; otherwise its status is `NOT_RENDERED` or `FAILED_VALIDATION`.

Deterministic validation runs before Firm and Hermes. Firm retains assumptions, capital requirement, metrics, decisions, and economic risks—not cell grids. Hermes evaluates plausibility, maturity, and validation priority but cannot change arithmetic. Material plan changes stale Business Plan and Pitch without overwriting prior artifacts.

## Tests and scenarios

Focused tests cover native mapping, BPW provenance, observed/calculated/forecast separation, assumption provenance, revenue formulas, customer/cost/support propagation, staffing and tax unknowns, P&L, delayed-cash roll-forward, capital requirement, financing states, market and operational capacity, three scenarios, sensitivity, missing opening cash, workbook rendering/reconciliation boundaries, Firm/Hermes ordering, idempotent fingerprints, artifacts, and required scenarios A–L.

## Limitations

The current deterministic model supports monthly/annual periods and core driver-based revenue models, not jurisdiction-specific statutory accounting. Tax, interest, depreciation, working capital beyond payment delay, and FX require explicit future inputs. No workbook is claimed because the canonical BPW template is unavailable. The plan is an evidence-backed planning model, not audited financial statements.

## Exact next slice

Implement `compile-business-plan`, consuming the validated problem, market/ICP, offer, demand, commercial, customer-value, retention, Unit Economics, BMC, and BPW Financial Plan artifacts. Pitch, Kickstarter, and broad content automation remain downstream.
