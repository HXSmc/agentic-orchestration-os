# GLM quota rules — verified 2026-10-04 against docs.z.ai/devpack/overview + docs.z.ai/devpack/notice/usage-revision (points-based plan since 2026-07-30)
CAP=80                 # prompts per rolling 5h window (Lite plan)
HARD_STOP=75           # refuse new spokes at/above this weighted spend
WARN_AT=60             # prefer glm-4.7, halve waves at/above this
PEAK_START_UTC=6       # Beijing 14:00 = 06:00 UTC
PEAK_END_UTC=9         # Beijing 14:00–18:00 Mon–Fri = 06:00–10:00 UTC; last peak hour starts 09:xx UTC. Weekends are off-peak.
W_52_PEAK=2            # glm-5.3 peak = 100% points
W_52_OFF=1             # glm-5.3 off-peak = 50% points (promo 2026-09-25..10-07: ALL hours at off-peak rate)
# NOTE 2026-10-04: glm-5.2/5.1 ids route to glm-5.3. glm-4.7 is DEPRECATED and routes to glm-5.3-flash (cheaper tier: ~0.4x off / 1.2x peak legacy framing). Keep W_47 as the flash weight.
W_47=1                 # glm-4.7 id → glm-5.3-flash weight, always
QUOTA_SHARE=80         # this machine's share of the ACCOUNT-wide cap. Set 40 on BOTH
                       # machines when Mac + Windows PC orchestrate in the same window
                       # (the ledger below is per-machine; the plan quota is not).
VERIFIED_UNTIL=2026-11-30   # re-verify after this date (promo ends 2026-10-07; multipliers may shift)
W_46V=2                # glm-4.6v vision weight (treat like glm-5.3 standard tier)
