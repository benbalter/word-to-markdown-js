## Deployment Notes

Set NODE_ENV=production before running npm run migrate. The string _<https://status.internal.example/local>_ appears in the checklist as plain text, not a hyperlink.

1. Verify APP_PORT=8080 in .env.production
2. Restart the service with systemctl restart api.service

If rollback is needed, execute git revert --no-edit HEAD and post confirmation in **#release-ops**.