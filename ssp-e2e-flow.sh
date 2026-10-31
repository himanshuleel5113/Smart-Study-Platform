#!/bin/bash
# Smart Study Platform - end-to-end API flow test through the frontend proxy.
# Usage: bash ssp-e2e-flow.sh [BASE_URL]   (default http://localhost)
set -u
BASE="${1:-http://localhost}"
D="$HOME/.ssp-test"; mkdir -p "$D"
EMAIL="student$(date +%s)@example.com"
PASSWORD="Password123!"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "PASS: $1 ($3)"; else FAIL=$((FAIL+1)); echo "FAIL: $1 (expected $2, got $3)"; fi }
first_id() { grep -oE '"id":[ ]*[0-9]+' "$1" | head -1 | grep -oE '[0-9]+'; }

echo "=== 1. Register: $EMAIL ==="
REG=$(curl -s -o "$D/reg.json" -w "%{http_code}" -X POST "$BASE/api/users/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Student\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "register" 201 "$REG"

echo "=== 2. Login ==="
LOGIN=$(curl -s -o "$D/login.json" -w "%{http_code}" -X POST "$BASE/api/users/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "login" 200 "$LOGIN"
TOKEN=$(grep -oE '"token":[ ]*"[^"]*"' "$D/login.json" | head -1 | awk -F'"' '{print $4}')
if [ -z "$TOKEN" ]; then echo "NO JWT"; exit 1; fi
echo "JWT acquired (len ${#TOKEN})"
AUTH="Authorization: Bearer $TOKEN"

echo "=== 3. Profile ==="
PROF=$(curl -s -o "$D/prof.json" -w "%{http_code}" "$BASE/api/users/profile" -H "$AUTH")
check "profile" 200 "$PROF"; cat "$D/prof.json"; echo

echo "=== 4. Create subject ==="
SUBJ=$(curl -s -o "$D/subj.json" -w "%{http_code}" -X POST "$BASE/api/subjects" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"DevOps","description":"Docker and Kubernetes study"}')
check "create subject" 201 "$SUBJ"; cat "$D/subj.json"; echo
SUBJECT_ID=$(first_id "$D/subj.json"); echo "subject id=$SUBJECT_ID"

echo "=== 5. List subjects ==="
LS=$(curl -s -o "$D/subjs.json" -w "%{http_code}" "$BASE/api/subjects" -H "$AUTH")
check "list subjects" 200 "$LS"

echo "=== 6. Start session ==="
START=$(curl -s -o "$D/start.json" -w "%{http_code}" -X POST "$BASE/api/study-sessions/start" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"subjectId\":$SUBJECT_ID}")
check "start session" 201 "$START"; cat "$D/start.json"; echo
sleep 3
echo "=== 7. Stop session ==="
STOP=$(curl -s -o "$D/stop.json" -w "%{http_code}" -X POST "$BASE/api/study-sessions/stop" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
check "stop session" 200 "$STOP"; cat "$D/stop.json"; echo

echo "=== 8. History ==="
HIST=$(curl -s -o "$D/hist.json" -w "%{http_code}" "$BASE/api/study-sessions/history" -H "$AUTH")
check "study history" 200 "$HIST"; head -c 300 "$D/hist.json"; echo

echo "=== 9. Stats ==="
STATS=$(curl -s -o "$D/stats.json" -w "%{http_code}" "$BASE/api/study-stats" -H "$AUTH")
check "study stats" 200 "$STATS"; cat "$D/stats.json"; echo

echo "=== 10. Create manual quiz ==="
QUIZ=$(curl -s -o "$D/quiz.json" -w "%{http_code}" -X POST "$BASE/api/quizzes" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"title":"Docker Basics","description":"Container fundamentals"}')
check "create quiz" 201 "$QUIZ"; cat "$D/quiz.json"; echo
QUIZ_ID=$(first_id "$D/quiz.json"); echo "quiz id=$QUIZ_ID"

echo "=== 11. Add questions ==="
Q1=$(curl -s -o "$D/q1.json" -w "%{http_code}" -X POST "$BASE/api/quizzes/$QUIZ_ID/questions" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"questionText":"What does Docker build from?","optionA":"Dockerfile","optionB":"Makefile","optionC":"pom.xml","optionD":"package.json","correctAnswer":"A"}')
check "add question 1" 201 "$Q1"
Q2=$(curl -s -o "$D/q2.json" -w "%{http_code}" -X POST "$BASE/api/quizzes/$QUIZ_ID/questions" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"questionText":"Which command lists containers?","optionA":"docker ls","optionB":"docker ps","optionC":"docker show","optionD":"docker list","correctAnswer":"B"}')
check "add question 2" 201 "$Q2"

echo "=== 12. Fetch quiz detail ==="
QD=$(curl -s -o "$D/qd.json" -w "%{http_code}" "$BASE/api/quizzes/$QUIZ_ID" -H "$AUTH")
check "fetch quiz detail" 200 "$QD"
QQ=$(curl -s -o "$D/qq.json" -w "%{http_code}" "$BASE/api/quizzes/$QUIZ_ID/questions" -H "$AUTH")
check "fetch quiz questions" 200 "$QQ"
QN=$(grep -o '"questionText"' "$D/qq.json" | wc -l); echo "questions: $QN"

echo "=== 13. Submit quiz ==="
QIDS=$(grep -oE '"id":[ ]*[0-9]+' "$D/qq.json" | grep -oE '[0-9]+' | awk '{printf sep "{\"questionId\":" $0 ",\"selectedAnswer\":\"A\"}"; sep=","} END{print ""}')
SUB=$(curl -s -o "$D/subm.json" -w "%{http_code}" -X POST "$BASE/api/quiz-submissions" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"quizId\":$QUIZ_ID,\"answers\":[$QIDS]}")
check "submit quiz" 200 "$SUB"; cat "$D/subm.json"; echo

echo "=== 14. Quiz attempts ==="
ATT=$(curl -s -o "$D/att.json" -w "%{http_code}" "$BASE/api/quiz-attempts" -H "$AUTH")
check "quiz attempts" 200 "$ATT"; head -c 300 "$D/att.json"; echo

echo "=== 15. AI quiz (dummy key: expect graceful 5xx, no fake success) ==="
AI=$(curl -s -o "$D/ai.json" -w "%{http_code}" -X POST "$BASE/api/ai-quizzes/generate" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"topic":"Kubernetes","numberOfQuestions":3,"difficulty":"easy"}' --max-time 90)
echo "AI endpoint HTTP status: $AI"; head -c 300 "$D/ai.json"; echo

echo "=============================="
echo "RESULT: $PASS passed, $FAIL failed"
