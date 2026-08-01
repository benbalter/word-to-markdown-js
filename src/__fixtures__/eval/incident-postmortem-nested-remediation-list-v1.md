# API Outage Postmortem

The team recorded the remediation plan below during the follow-up review for the 14 May outage.

1. Stabilize production
   1. Roll back the rate-limit rule added at 09:10
      1. Confirm rollback on all edge regions
         1. Check Frankfurt and Sydney first because they lagged during deploy
      2. Capture timestamps from the gateway logs
   2. Notify support once error rates remain below 1% for 15 minutes
2. Investigate root cause
   1. Review configuration changes merged that morning
      1. Compare the gateway policy diff with the staging version
         1. Flag any missing allowlist entries
            1. Include partner IP ranges used by billing callbacks
   2. Interview the on-call engineer
      1. Ask which alerts were noisy versus actionable
3. Document preventive actions
   1. Add a canary rollout for policy changes
      1. Start with 5% of traffic
         1. Monitor
            1. 5xx rate
            2. p95 latency
      2. Expand to 25% only after two clean intervals
   2. Update the runbook with rollback screenshots