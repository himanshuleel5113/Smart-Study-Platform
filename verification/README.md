# Local startup and project verification - 7 November 2026

For the latest service recovery, recurring health checks, and local monitoring
corrections, see [the 9 November service-health report](service-health-2026-11-09.md).

The pending startup-script corrections and local verification are complete.
The platform was left running at http://localhost through Docker Compose.

## Changes

- `start-platform.ps1` starts the existing Compose project using the root `.env`.
  It checks Docker/configuration, supports `-Build` to test/package Java services
  and build images, and waits for database, backend, frontend, and monitoring
  readiness. Normal starts reuse local images; build starts can pull missing
  dependency images. Errors return a nonzero exit code.
- `stop-platform.ps1` stops only the `smart-study-platform-main` Compose project.
  Containers and persistent volumes are retained. No host process matching or
  port-based process termination remains.
- `run.bat` and `stop.bat` delegate to the PowerShell scripts and propagate failure.
- The root README documents the new startup workflow and correct frontend URL.
- `verification/check_lifecycle.py` repeats the data-persistence and isolation
  checks using an account created by the existing browser verification scripts.

Existing unrelated working-tree edits were retained. No backend changes were
needed for this pass. Nothing was pushed or deployed to AWS/Kubernetes.

## Results

| Check | Result |
| --- | --- |
| Backend Maven tests | 99 passed, zero failures/errors/skips: user 9, study 26, quiz 43, gateway 21 |
| Build/start path | Maven packaging and all five application image builds passed; the stack became ready |
| Service readiness | All four backend health endpoints UP; frontend, Prometheus, and Grafana responded successfully |
| Browser authentication | Real registration/login, auth layouts, modal focus, and mobile menu passed |
| Browser application flows | Subject create/edit/view/delete; study start/reload/stop/history; manual quiz questions/submission/results; profile, themes, and retry/logout passed |
| Responsive checks | All screens passed at 1920, 1366, 768, and 390 pixels |
| Browser diagnostics | No unexpected console/API errors, JavaScript exceptions, or missing assets |
| Stop/restart | Both batch launchers worked from a different directory; all project containers stopped and restarted |
| Data retention | Fresh login and identical subjects, session history, quizzes, attempts, and statistics after restart |
| Isolation | Persistent volume names unchanged; unrelated container state and an owned sentinel host process preserved |
| Credential retention | `.env` and `.env.aws` file hashes unchanged across stop/restart |
| Failure reporting | Both batch launchers returned exit 1, with no false success message, when Docker was unavailable |
| Static checks | PowerShell parsing, lifecycle Python parsing, JavaScript syntax, and scoped `git diff --check` passed |

AI generation remains unavailable by request. No real AI call was made; AI unit
tests use mocks. Profile/password/social/notification features previously marked
unsupported remain outside this work. These results cover the local Compose
deployment, not AWS infrastructure, Kubernetes, Jenkins, or load testing.

## Repeat

Start Docker Desktop, then run from the repository root:

```powershell
.\start-platform.ps1 -Build
$env:SSP_BASE_URL = 'http://localhost'
python frontend/verification/check_ui.py
python frontend/verification/check_flow.py dashboard subjects study quizzes taking results profile_settings responsive failures
python verification/check_lifecycle.py
```

The browser scripts require Python Playwright and Chrome and create real isolated
test data. Their credentials and screenshots stay in ignored
`frontend/verification/artifacts/`. The lifecycle check intentionally stops and
restarts the local project and checks the records created by those scripts. It
leaves the platform running after success. Use `mvn -B -ntp test` for backend tests
alone, `run.bat` for subsequent starts, and `stop.bat` to stop the project.
