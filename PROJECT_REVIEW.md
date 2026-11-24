# Smart Study Platform review — 11 November 2026

The project has a working local study and quiz application, but it is not yet a
complete production service. Earlier work left several visible account and quiz
features unfinished. This review uses the README, source code, existing reports,
and the checks described below; the original intended feature list was not supplied.

## What was fixed in this review

| Problem | Result |
| --- | --- |
| Profile/password service methods existed without API routes or usable controls | Settings can save the user's name and change a password after confirming the current password. Email remains read-only. |
| Results showed only in-memory selections and lost details after reload | Authenticated answer-review endpoint and UI show saved selections, correct answers, and correctness for historical attempts. |
| Deleting a quiz removed the question text needed for review | New submissions snapshot question text and marked options. Their reviews survive deletion of the source quiz. Old deleted questions cannot be reconstructed. |
| A downstream exception could become an “invalid token” response | Authentication filtering no longer catches controller failures. Connection failures return HTTP 503, with bounded connection/read timeouts. |
| Four concurrent timer starts created four active sessions | Transaction-scoped PostgreSQL locks serialize start/stop operations per user, including across service replicas. Legacy duplicate timers can be stopped one at a time. |
| Long question, option, or description text could fail at the database's 255-character limit | Subject and quiz content columns use PostgreSQL text. |
| Null answer lists/items and malformed quiz requests could produce HTTP 500 | Invalid submissions return HTTP 400. Submitting an empty quiz returns HTTP 409. |
| Registration time was missing, then invented at the next login | New registrations record their actual time. Legacy unknown registration dates stay unknown. |
| Oversized passwords could fail inside BCrypt | New passwords are checked against BCrypt's 72-byte limit before hashing. |
| Azure deployment was hard-coded and the service example used the wrong key variable | `OPENAI_MODEL` selects the Azure deployment. The example uses `AZURE_OPENAI_KEY` and the Azure v1 endpoint. |
| Incomplete AI output could reach persistence | All generated questions/options, answer letters, and requested question count are checked before saving. Mocked tests cover malformed provider content. |
| Browser assets could remain stale for seven days after deployment | Script/style responses revalidate; asset URLs have a new version so previously cached files are refreshed. |
| Fresh AWS monitoring/application startup differed from local setup | AWS Compose now includes recurring health checks, waits for healthy dependencies, and mounts Grafana provisioning. Cloud runtime validation is still pending. |

Existing working-tree edits and credential files were retained. No cloud resources,
published images, or repository commits were changed by this review.

## Feature status

| Area | Current capability | Remaining work |
| --- | --- | --- |
| Authentication | Registration, login, JWT checks, password change | Password reset by email, email verification, immediate revocation of existing JWT sessions |
| Account | Read profile, edit name, real activity/statistics | Email change with verification; photo upload is absent |
| Subjects | Create, read, edit, delete, local search | Deleting a subject retains session history under its numeric ID; archive/name snapshots would improve this |
| Study tracking | One running timer per user, reload recovery, stop, history, totals | Scheduled sessions, reminders, pause/resume, and Pomodoro countdown are not implemented |
| Manual quizzes | Create quiz, add questions, take quiz, submit, score | Question editing/deletion and richer quiz management controls |
| Results | Attempt history, score trends, persisted marked-answer review | Topic-level analytics and timed quiz metrics have no supporting model |
| AI quizzes | Provider integration, configurable deployment, validation and error handling | Valid Azure key/endpoint/deployment and successful live generation check |
| Settings | Editable name, password change, device-local Light/Dark/System appearance | Notification delivery and social login are not implemented; their controls remain disabled |
| Search | Subject, quiz, and study-history filters | Cross-application server-side search is not implemented |
| Monitoring | Nagios Core (service and TCP health checks) | Verify alerts reach an operator; configured service checks track real-time microservice status |

## What is needed next, in priority order

1. **Enable and verify Azure AI.** Both `.env` and `.env.aws` contain placeholder
   Azure keys at review time. Set the real key privately, use that resource's
   endpoint ending in `/openai/v1/`, and set `OPENAI_MODEL` to the exact deployment
   name. The deployment must support the Responses API. Recreate the quiz-service
   container and complete a real generation → submission → answer-review flow.
   Unit tests using mocks do not establish Azure availability, quota, or billing.

2. **Agree on the expected product scope.** The visible unfinished features are
   social sign-in, notifications, scheduling, email/password recovery, and question
   editing. Prioritize those against the original project expectations. Disabled
   controls and “coming soon” labels are not completed features.

3. **Prepare account security for public use.** Add login/registration rate limits,
   email verification and recovery, and revocation of existing sessions on password
   changes. Existing JWTs currently remain valid until expiry (up to 24 hours).
   Local defaults are for development; production needs unique secrets and HTTPS.

4. **Make database changes and recovery reproducible.** Services currently use
   Hibernate `ddl-auto=update`, without versioned migrations. Add migrations,
   backup/restore automation, and a restore drill. Enforce email uniqueness in the
   database after checking existing records; application-only duplicate checks can
   race. Database IDs are mostly scalar fields without foreign-key constraints.

5. **Verify the intended deployment.** Local Compose, Kubernetes manifests,
   Jenkins, and AWS Terraform are separate paths. Passing local checks does not
   prove the others. Terraform targets AWS; Azure is currently only the AI provider.
   Azure hosting would need its own deployment setup if that was the expectation.

6. **Complete production operations.** Configure a domain/TLS, retain database
   backups off the instance, validate monitoring alerts, add deployment smoke tests
   and rollback checks, and run authenticated load tests. All-list API responses
   and per-quiz question fetches should be paginated before larger usage.

## Deployment findings that were not exercised

- AWS Compose health checks, dependency readiness, and Grafana provisioning were
  aligned with local Compose. The configuration was checked locally; its cloud
  deployment still needs smoke tests and a rollout/rollback exercise.
- Terraform exposes HTTP on port 80, stores Docker volumes on the instance's root
  disk, marks that disk for deletion on termination, and enables S3 `force_destroy`.
  Review backup and retention requirements before any infrastructure replacement.
- Jenkins uses a fixed Azure endpoint, requires configured credentials and Docker
  access, and starts temporary databases even though the current Java tests mostly
  use mocks. Its cloud/Kubernetes deployment paths were not run in this review.
- The Kubernetes configuration also needs the correct Azure endpoint/deployment.
  No Kubernetes or AWS rollout, Terraform apply, Jenkins build, or load test was run.

## Verification

The original 99 Java tests passed before changes. Updated regression and live
verification results are recorded in `verification/project-review-2026-11-11.md`.

Repeat from the project root with Docker Desktop and Java/Maven available:

```powershell
.\start-platform.ps1 -Build
$env:SSP_BASE_URL = 'http://localhost'
python verification/check_project.py
python frontend/verification/check_ui.py
python frontend/verification/check_flow.py dashboard subjects study quizzes taking results profile_settings responsive failures
```

Browser verification needs Python Playwright and Chrome. Checks create isolated
test accounts and records. Browser credentials/screenshots stay in the ignored
artifact directory. `verification/check_lifecycle.py` additionally stops/restarts
the local project and verifies persistence. None of these commands needs a real
AI call unless the optional browser `ai` step is explicitly selected.
