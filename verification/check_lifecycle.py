"""Windows integration check: stops and restarts the local Compose project.

Run the frontend check_ui.py and check_flow.py first to create an isolated account
and records. Requires Docker Desktop, local images, and a running platform.
No AI requests are made. Generated credentials remain in ignored UI artifacts.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
PROJECT = "smart-study-platform-main"


def docker(*args):
    return subprocess.check_output(["docker", *args], cwd=ROOT, text=True).strip()


def volumes():
    return set(docker("volume", "ls", "--filter",
                      f"label=com.docker.compose.project={PROJECT}",
                      "--format", "{{.Name}}").splitlines())


def other_containers():
    records = docker("ps", "-a", "--format", "{{json .}}")
    result = {}
    for line in records.splitlines():
        item = json.loads(line)
        if f"com.docker.compose.project={PROJECT}" not in item["Labels"].split(","):
            result[item["ID"]] = item["State"]
    return result


def env_hashes():
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in (".env", ".env.aws") if (ROOT / name).exists()}


def account_snapshot():
    credentials = json.loads((ROOT / "frontend/verification/artifacts/test-account.json").read_text())
    login = urllib.request.Request("http://localhost/api/users/login",
                                   data=json.dumps(credentials).encode(),
                                   headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(login, timeout=15) as response:
        token = json.load(response)["token"]
    snapshot = {}
    for endpoint in ("users/profile", "subjects", "study-sessions/history",
                     "study-stats", "quizzes", "quiz-attempts"):
        request = urllib.request.Request(f"http://localhost/api/{endpoint}",
                                         headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
        if endpoint == "users/profile":
            # A fresh login legitimately changes lastLoginAt.
            data = {key: data[key] for key in ("id", "name", "email")}
        if isinstance(data, list):
            data = sorted(data, key=lambda item: json.dumps(item, sort_keys=True))
        snapshot[endpoint] = data
    for endpoint in ("subjects", "study-sessions/history", "quizzes", "quiz-attempts"):
        assert snapshot[endpoint], f"Run the full browser flow first: {endpoint} is empty"
    return snapshot


def launch(name):
    # Deliberately run from another directory to test path resolution. These
    # launchers are fixed repository filenames, never input from API responses.
    subprocess.run(["cmd.exe", "/d", "/c", str(ROOT / name)],
                   cwd=ROOT / "frontend", check=True, timeout=720)


def main():
    if os.name != "nt":
        raise SystemExit("This check exercises the Windows launchers.")
    before = account_snapshot()
    before_volumes = volumes()
    assert len(before_volumes) >= 3, "Expected persistent database volumes"
    before_others = other_containers()
    before_env = env_hashes()
    # The old shutdown script matched this command line. The new script must
    # leave this owned sentinel process alive throughout the stop/start cycle.
    sentinel = subprocess.Popen(
        [sys.executable, "-c", "import sys; sys.stdin.read()", "smart-study-process-check"],
        stdin=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        launch("stop.bat")
        assert not docker("ps", "-q", "--filter", f"label=com.docker.compose.project={PROJECT}"), "Project containers still running"
        assert volumes() == before_volumes, "Volumes changed during shutdown"
        assert other_containers() == before_others, "Unrelated containers changed"
        assert sentinel.poll() is None, "Shutdown stopped an unrelated host process"
        print("PASS: shutdown stops only the project; volumes and unrelated processes/containers remain", flush=True)
        launch("run.bat")
        assert account_snapshot() == before, "Account or study/quiz data changed across restart"
        assert volumes() == before_volumes, "Volumes changed across restart"
        assert env_hashes() == before_env, "Local credential files changed"
        assert other_containers() == before_others, "Unrelated containers changed"
        assert sentinel.poll() is None, "Startup affected an unrelated host process"
        print("PASS: restart from another directory preserves login, subjects, sessions, quizzes, attempts, stats, and credential files", flush=True)
    finally:
        sentinel.stdin.close()
        sentinel.wait(timeout=10)


if __name__ == "__main__":
    main()
