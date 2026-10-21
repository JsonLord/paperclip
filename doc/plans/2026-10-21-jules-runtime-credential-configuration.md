# Jules runtime credential configuration

This focused patch starts at rollback source
`0eba2bb8dce7093b77ccb952f71fea91edee6da8`. It changes the environment profile
importer, without importing the newer validation or workforce layer.

## Requested limits

Keep `JULES_API_1`, `JULES_API_2`, and `JULES_API_90` as Hugging Face Space
secrets. Their numeric suffixes identify credentials and do not infer quotas.
After the deployment freeze is lifted, deploy this patch and configure these
non-secret Space variables together:

```dotenv
JULES_SESSION_START_LIMIT_1=10
JULES_CONCURRENT_SESSION_LIMIT_1=3
JULES_SESSION_START_LIMIT_2=10
JULES_CONCURRENT_SESSION_LIMIT_2=3
JULES_SESSION_START_LIMIT_90=90
JULES_CONCURRENT_SESSION_LIMIT_90=90
JULES_SESSION_WINDOW_SEC=86400
```

“Per day” uses the existing rolling 24-hour window. Existing reserve starts
remain reserved for urgent requests. Limits are per native profile; this patch
does not aggregate a physical account's consumption across company profiles or
other clients. Avoid using the same credential simultaneously across companies
until physical-account aggregation is implemented.

## Import behavior

The importer recognizes nonempty `JULES_API_<positive integer>` keys, including
90. Per-key quota variables override global quota variables. All explicitly
configured limits must be positive PostgreSQL integers; validation happens
before creating or rotating secrets.

Reconciliation updates explicitly managed quotas in place. It preserves profile
IDs, usage history, enabled/health state, and manual quotas without an environment
override. Credential rotation and unreadable-secret repair retain their existing
behavior. No schema or API changes are required.

## Deployment and live qualification handoff

The attached API qualification proposal explicitly freezes the current Space
deployment. No Space variables or deployment were changed for this patch.
Current Space revision: `763bd8154b9e417ea171749936da6e968b3cb6ea`.

Once deployment is authorized:

1. Verify a fresh durable backup and the exact reviewed patch tree. Deploy only
   this rollback-based patch using the existing HF synchronization process.
2. Apply the variables above with the already configured secret bindings. Wait
   for the Space to report RUNNING and verify `/api/health` and native admin login.
3. Inspect company `347647d4-e607-4310-b94e-10116f0a42a4` (AUX) for blocked initial
   issues and bootstrap-paused workers before rebind: source rebind can wake them.
4. Use the authenticated native endpoint
   `POST /api/companies/347647d4-e607-4310-b94e-10116f0a42a4/founderos/rebind-jules-source`
   to reconcile profiles and source bindings. Verify profiles for keys 1, 2, and
   90 have the limits above and old profile IDs/history remain intact.
5. Launch one isolated, safe Jules probe against `JsonLord/aux-company`; record
   its native heartbeat ID and genuine remote Jules session ID. Poll that same
   run through reconciliation. An ambiguous response must not trigger a second
   dispatch. Do not claim live success without a remote session ID and expected
   result. Do not load-test the quota ceiling.

Hermes already passed a safe native probe with the updated credentials: run
`8cc27cb8-92e6-433b-b4ca-68a322b49c51` succeeded with exact provider response
`PAPERCLIP_HERMES_UPDATED_CREDENTIALS_OK`. Its issue was completed and unassigned.
The earlier Jules probe had no remote session and remains a historical failure.

## Local verification

The importer, profile capability, and capacity broker suites passed 42 tests,
including a final rerun after formatting and test environment isolation. They
cover requested limits, precedence, invalid settings, reuse, company isolation,
and preserved manual quotas. Full tests passed: 791 passed, 1 skipped across 138
files. Workspace typechecking, build, token checks, and whitespace checks passed.
The UI build reports its existing large-chunk warning. Live Jules qualification
remains pending deployment and an actual provider receipt.
