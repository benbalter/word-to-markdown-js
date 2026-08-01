## Deployment Notes

Before restarting the service, set NODE_ENV=production and run npm run migrate from the release directory.

For the rollback checklist, refer to _<https://status.example.net/rollback>_ in the printed runbook; this text should remain plain text, not a link.

- Verify that systemctl status api returns active (running)
- If health checks fail, inspect /var/log/api/error.log before paging the on-call engineer.