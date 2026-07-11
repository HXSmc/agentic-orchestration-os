# GLM quota rules — verified 2026-07-10 against docs.z.ai/devpack/faq
CAP=80                 # prompts per rolling 5h window (Lite plan)
HARD_STOP=75           # refuse new spokes at/above this weighted spend
WARN_AT=60             # prefer glm-4.7, halve waves at/above this
PEAK_START_UTC=6       # Beijing 14:00 = 06:00 UTC
PEAK_END_UTC=9         # Beijing 18:00 → last peak hour starts 09:xx UTC
W_52_PEAK=3            # glm-5.2 weight during peak
W_52_OFF=2             # glm-5.2 weight off-peak (promo makes it 1 through Sept 2026; keep 2 = conservative)
W_47=1                 # glm-4.7 weight, always
QUOTA_SHARE=80         # this machine's share of the ACCOUNT-wide cap. Set 40 on BOTH
                       # machines when Mac + Windows PC orchestrate in the same window
                       # (the ledger below is per-machine; the plan quota is not).
VERIFIED_UNTIL=2026-09-30   # promo/pricing horizon — re-verify rules after this date
