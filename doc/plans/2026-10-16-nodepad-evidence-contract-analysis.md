# Nodepad Evidence Contract Analysis

Based on the live Nodepad API (`/api-docs`):

```text
Concept                     Live endpoint/API        Read?   Write?
-------------------------------------------------------------------
workspace context           /api/v1/workspaces/{id}/context     Yes     No
brain                       /api/v1/workspaces/{id}/brain       Yes     No
hypothesis                  /api/v1/workspaces/{id}/hypotheses  Yes     Yes
evidence                    /api/v1/workspaces/{id}/evidence    Yes     Yes
counterevidence             /api/v1/workspaces/{id}/evidence    Yes     Yes (polarity)
research gap                /api/v1/workspaces/{id}/research/tasks Yes     Yes
experiment                  UNSUPPORTED_BY_LIVE_API             No      No
experiment result           UNSUPPORTED_BY_LIVE_API             No      No
qualification               /api/v1/workspaces/{id}/brain       Yes     No
qualification band          /api/v1/workspaces/{id}/brain       Yes     No
material change             /api/v1/workspaces/{id}/events      Yes     No
provenance                  /api/v1/workspaces/{id}/evidence    Yes     Yes
```
