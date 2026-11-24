"""API regressions against local Compose; creates isolated accounts and records.

Run from the repository root: python verification/check_project.py
No AI calls, cloud changes, or existing-user mutations are performed.
"""
import concurrent.futures
import json
import os
import secrets
import threading
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("SSP_BASE_URL", "http://localhost").rstrip("/")


def request(path, body=None, token=None, method=None, expected=200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data, headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=110)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        payload = response.read()
        result = json.loads(payload) if payload else None
        if expected is not None:
            assert response.status == expected, (path, response.status, result)
        return result if expected is not None else response.status


def account():
    email = "project-review-" + uuid.uuid4().hex + "@example.test"
    password = secrets.token_urlsafe(20)
    request("/api/users/register", {"name": "Project Review", "email": email, "password": password}, expected=201)
    token = request("/api/users/login", {"email": email, "password": password})["token"]
    return email, password, token


def main():
    email, password, token = account()
    profile = request("/api/users/profile", token=token)
    assert profile["createdAt"] and profile["lastLoginAt"]
    updated = request("/api/users/profile", {"name": " Updated Review "}, token, "PUT")
    assert updated["name"] == "Updated Review" and updated["email"] == email
    request("/api/users/profile", {"name": " "}, token, "PUT", 400)
    request("/api/users/password", {"currentPassword": "wrong", "newPassword": "ChangedPassword123!"}, token, expected=401)
    new_password = secrets.token_urlsafe(22)
    request("/api/users/password", {"currentPassword": password, "newPassword": new_password}, token, expected=204)
    request("/api/users/login", {"email": email, "password": password}, expected=401)
    token = request("/api/users/login", {"email": email, "password": new_password})["token"]
    assert request("/api/users/profile", token=token)["name"] == "Updated Review"
    print("PASS: profile persistence, password hashing/login behavior, and account validation", flush=True)

    subjects = [request("/api/subjects", {"name": "Concurrent study " + str(i), "description": "Details " * 60}, token, expected=201) for i in range(4)]
    barrier = threading.Barrier(4)

    def start(subject):
        barrier.wait()
        return request("/api/study-sessions/start", {"subjectId": subject["id"]}, token, expected=None)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        statuses = list(pool.map(start, subjects))
    assert sorted(statuses) == [201, 409, 409, 409], statuses
    history = request("/api/study-sessions/history", token=token)
    assert sum(row["endedAt"] is None for row in history) == 1
    request("/api/study-sessions/stop", {}, token)
    request("/api/study-sessions/stop", {}, token, expected=409)
    print("PASS: concurrent timer starts create exactly one active session", flush=True)

    quiz = request("/api/quizzes", {"title": "Review quiz", "description": "Description " * 60}, token, expected=201)
    question = request(f"/api/quizzes/{quiz['id']}/questions", {
        "questionText": "Long question " * 70, "optionA": "Wrong " * 60,
        "optionB": "Correct " * 60, "optionC": "Third", "optionD": "Fourth", "correctAnswer": "B"
    }, token, expected=201)
    assert "correctAnswer" not in question
    for bad in (None, [None]):
        request("/api/quiz-submissions", {"quizId": quiz["id"], "answers": bad}, token, expected=400)
    result = request("/api/quiz-submissions", {"quizId": quiz["id"], "answers": [
        {"questionId": question["id"], "selectedAnswer": "A"}]}, token)
    assert result["score"] == 0
    path = f"/api/quiz-attempts/{result['attemptId']}/answers"
    review = request(path, token=token)
    assert review["answers"][0]["correct"] is False
    assert review["answers"][0]["correctAnswer"] == "B"
    other_token = account()[2]
    request(path + "?userId=" + str(profile["id"]), token=other_token, expected=400)
    request(f"/api/quizzes/{quiz['id']}", token=other_token, method="DELETE", expected=400)
    request(f"/api/quizzes/{quiz['id']}", token=token, method="DELETE", expected=204)
    assert request(path, token=token) == review
    print("PASS: long quiz text, marked answers, cross-account isolation, and review after quiz deletion", flush=True)


if __name__ == "__main__":
    main()
