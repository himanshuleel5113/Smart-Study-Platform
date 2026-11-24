# Local service recovery - 9 November 2026

## Findings and fixes

- Docker Desktop's Linux engine was stopped. Starting Docker Desktop restored
  the ten existing Compose containers using their `unless-stopped` policies.
- Prometheus reported DNS failures for `cadvisor` and `node-exporter`. These
  exporters exist in the AWS Compose configuration, not the local stack. Local
  Compose now mounts `monitoring/prometheus.local.yml`, containing its five
  actual scrape targets. The AWS monitoring configuration is unchanged.
- Only PostgreSQL containers previously had recurring Compose health checks.
  All ten containers now have them. The gateway waits for healthy backend
  services, the frontend waits for the gateway, and Grafana waits for Prometheus.
- `start-platform.ps1` now starts Docker Desktop when its engine is unavailable,
  waits for it, and verifies successful metrics scrapes before reporting success.
  HTTP readiness failures identify the remaining services or metrics targets.

## Verified

- Updated launcher completed successfully; all ten containers reported healthy.
- User, study, quiz, and gateway `/actuator/health` responses reported `UP`.
- Prometheus configuration passed `promtool check config`; all five local scrape
  targets reported `up`, with no scrape errors.
- Real browser registration/login passed, including all four authentication
  layout widths, modal focus, and the mobile menu.
- Browser flow checks passed for dashboard, subject create/edit/delete, study
  sessions across reload, manual quizzes, answering/scoring, results,
  profile/settings, and simulated failure recovery.
- Successful browser flows had no JavaScript exceptions or missing assets.
- Full stop/start verification passed using the batch launchers from another
  directory. Fresh login and saved subjects, study history, quizzes, attempts,
  and statistics matched the pre-stop snapshot. Volume names and credential-file
  hashes were unchanged; unrelated containers and the sentinel process were
  preserved. All ten containers were healthy after restart and were left running.
- PowerShell parsing, Compose configuration validation, and scoped whitespace
  checks passed. No backend code changed during this recovery; Maven tests were
  not rerun.

The first subject-creation check exceeded the browser assertion's five-second
timeout and closed its connection (Nginx recorded HTTP 499). The subject was saved;
subsequent authenticated listing completed in about 435 ms. Repeating the unchanged
browser suite passed. The host had about 632 MiB of free physical memory during
the investigation, so delays remain possible under load.

## Operational limits

- These results cover local Docker Compose. Kubernetes application deployments
  remain scaled to zero; no application pods were Pending. AWS was not checked
  or changed.
- AI generation was not called. The quiz service and manual quiz flows work;
  successful AI generation still requires valid provider credentials.
- Use `run.bat` for subsequent starts and `docker compose ps` to inspect health.
  Process exits trigger the existing restart policy; a failed health check alone
  does not restart a still-running Docker container. Explicitly stopped containers
  need to be started again. Docker must be running while the application is used.
- Docker Desktop was started directly in this session. The new automatic
  Docker-launch branch was syntax checked; Docker was not shut down again to
  exercise that branch.
- Existing unrelated working-tree changes and credential files were retained.
