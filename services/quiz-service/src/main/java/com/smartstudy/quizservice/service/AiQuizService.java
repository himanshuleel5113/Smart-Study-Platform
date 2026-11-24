package com.smartstudy.quizservice.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openai.client.OpenAIClient;
import com.openai.models.responses.ResponseCreateParams;
import com.smartstudy.quizservice.dto.AiQuizGenerateRequest;
import com.smartstudy.quizservice.dto.AiQuizGenerateResponse;
import com.smartstudy.quizservice.dto.QuestionResponse;
import com.smartstudy.quizservice.model.Question;
import com.smartstudy.quizservice.model.Quiz;
import com.smartstudy.quizservice.repository.QuestionRepository;
import com.smartstudy.quizservice.repository.QuizRepository;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class AiQuizService {

    private final OpenAIClient openAIClient;
    private final ObjectMapper objectMapper;
    private final QuizRepository quizRepository;
    private final QuestionRepository questionRepository;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Value("${ai.deployment:gpt-4.1-mini}")
    private String deployment = "gpt-4.1-mini";

    @Value("${gemini.api.key:}")
    private String geminiApiKey;

    @Value("${gemini.model:gemini-2.5-flash}")
    private String geminiModel = "gemini-2.5-flash";

    public AiQuizService(
            OpenAIClient openAIClient,
            ObjectMapper objectMapper,
            QuizRepository quizRepository,
            QuestionRepository questionRepository
    ) {
        this.openAIClient = openAIClient;
        this.objectMapper = objectMapper;
        this.quizRepository = quizRepository;
        this.questionRepository = questionRepository;
    }

    @Transactional
    public AiQuizGenerateResponse generateQuiz(
            Long userId,
            AiQuizGenerateRequest request
    ) {
        String prompt = buildPrompt(request);
        String aiText;

        String activeGeminiKey = (geminiApiKey != null && !geminiApiKey.isBlank())
                ? geminiApiKey
                : System.getenv("GEMINI_API_KEY");

        if (activeGeminiKey != null && !activeGeminiKey.isBlank() && !"dummy-key-for-local-dev".equalsIgnoreCase(activeGeminiKey.trim())) {
            try {
                aiText = callGemini(prompt, activeGeminiKey.trim());
            } catch (Exception e) {
                System.err.println("Gemini API call failed: " + e.getMessage() + ". Using fallback generator.");
                aiText = null;
            }
        } else {
            try {
                ResponseCreateParams params = ResponseCreateParams.builder()
                        .input(prompt)
                        .model(deployment)
                        .build();

                var response = openAIClient.responses().create(params);
                aiText = extractText(response);
            } catch (Exception e) {
                System.err.println("OpenAI API call failed: " + e.getMessage() + ". Using fallback generator.");
                aiText = null;
            }
        }

        AiQuizData quizData = null;
        if (aiText != null) {
            quizData = parseResponse(aiText);

            if (quizData == null || quizData.title == null || quizData.title.isBlank()) {
                throw new IllegalStateException("AI returned an invalid quiz title");
            }

            if (quizData.questions == null || quizData.questions.isEmpty()) {
                throw new IllegalStateException("AI did not generate any questions");
            }

            if (quizData.questions.size() != request.getNumberOfQuestions()) {
                throw new IllegalStateException("AI returned the wrong number of questions. Please try again.");
            }
            // Validate the entire response before persisting a quiz or any questions.
            for (AiQuestionData question : quizData.questions) {
                if (question == null || isBlank(question.questionText) || isBlank(question.optionA)
                        || isBlank(question.optionB) || isBlank(question.optionC) || isBlank(question.optionD)) {
                    throw new IllegalStateException("AI returned an incomplete question. Please try again.");
                }
                question.correctAnswer = normalizeCorrectAnswer(question.correctAnswer);
            }
        } else {
            quizData = buildFallbackQuizData(request);
        }

        Quiz quiz = new Quiz(
                userId,
                quizData.title,
                quizData.description,
                true,
                Instant.now()
        );

        Quiz savedQuiz = quizRepository.save(quiz);

        for (AiQuestionData questionData : quizData.questions) {

            String correctAnswer =
                    normalizeCorrectAnswer(questionData.correctAnswer);

            Question question = new Question(
                    savedQuiz.getId(),
                    questionData.questionText,
                    questionData.optionA,
                    questionData.optionB,
                    questionData.optionC,
                    questionData.optionD,
                    correctAnswer
            );

            questionRepository.save(question);
        }

        List<QuestionResponse> questionResponses =
                questionRepository.findByQuizId(savedQuiz.getId())
                        .stream()
                        .map(this::toQuestionResponse)
                        .toList();

        return new AiQuizGenerateResponse(
                savedQuiz.getId(),
                savedQuiz.getTitle(),
                savedQuiz.getDescription(),
                true,
                questionResponses
        );
    }

    private String callGemini(String prompt, String apiKey) {
        String model = (geminiModel != null && !geminiModel.isBlank()) ? geminiModel : "gemini-3.5-flash-lite";
        String url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

        try {
            Map<String, Object> part = Map.of("text", prompt);
            Map<String, Object> content = Map.of("parts", List.of(part));
            Map<String, Object> genConfig = Map.of(
                    "temperature", 0.7,
                    "responseMimeType", "application/json"
            );
            Map<String, Object> requestBody = Map.of(
                    "contents", List.of(content),
                    "generationConfig", genConfig
            );

            String requestJson = objectMapper.writeValueAsString(requestBody);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(60))
                    .POST(HttpRequest.BodyPublishers.ofString(requestJson, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 503 || response.statusCode() == 429) {
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException ignored) {
                }
                response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            }

            if (response.statusCode() != 200) {
                String errorMsg = "Gemini API request failed with status " + response.statusCode();
                try {
                    JsonNode errorNode = objectMapper.readTree(response.body());
                    if (errorNode.has("error") && errorNode.get("error").has("message")) {
                        errorMsg = "Gemini API: " + errorNode.get("error").get("message").asText();
                    }
                } catch (Exception ignored) {
                }
                throw new IllegalStateException(errorMsg);
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode candidates = root.path("candidates");
            if (candidates.isArray() && !candidates.isEmpty()) {
                JsonNode parts = candidates.get(0).path("content").path("parts");
                if (parts.isArray() && !parts.isEmpty()) {
                    String rawText = parts.get(0).path("text").asText();
                    return cleanJson(rawText);
                }
            }

            throw new IllegalStateException("Gemini returned an empty candidate list or missing text.");
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to communicate with Gemini API: " + e.getMessage(), e);
        }
    }

    private String buildPrompt(AiQuizGenerateRequest request) {

        return """
                Generate a multiple-choice quiz.

                Topic: %s
                Number of questions: %d
                Difficulty: %s

                Return ONLY valid JSON.
                Do not use markdown.
                Do not wrap the JSON in ```json or ```.

                Use exactly this structure:

                {
                  "title": "Quiz title",
                  "description": "Short quiz description",
                  "questions": [
                    {
                      "questionText": "Question text",
                      "optionA": "Option A",
                      "optionB": "Option B",
                      "optionC": "Option C",
                      "optionD": "Option D",
                      "correctAnswer": "A"
                    }
                  ]
                }

                Rules:
                - Generate exactly %d questions.
                - Every question must have four options.
                - correctAnswer must be only A, B, C, or D.
                - Questions must be relevant to the requested topic.
                - Avoid duplicate questions.
                """.formatted(
                request.getTopic(),
                request.getNumberOfQuestions(),
                request.getDifficulty(),
                request.getNumberOfQuestions()
        );
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String extractText(
            com.openai.models.responses.Response response
    ) {
        StringBuilder text = new StringBuilder();

        response.output()
                .stream()
                .flatMap(item -> item.message().stream())
                .flatMap(message -> message.content().stream())
                .flatMap(content -> content.outputText().stream())
                .forEach(outputText -> text.append(outputText.text()));

        if (text.isEmpty()) {
            throw new IllegalStateException("AI returned an empty response");
        }

        return cleanJson(text.toString());
    }

    private String cleanJson(String text) {

        String cleaned = text.trim();

        if (cleaned.startsWith("```json")) {
            cleaned = cleaned.substring(7);
        } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.substring(3);
        }

        if (cleaned.endsWith("```")) {
            cleaned = cleaned.substring(0, cleaned.length() - 3);
        }

        return cleaned.trim();
    }

    private AiQuizData parseResponse(String aiText) {

        try {
            return objectMapper.readValue(aiText, AiQuizData.class);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "AI returned an invalid quiz format",
                    e
            );
        }
    }

    private String normalizeCorrectAnswer(String correctAnswer) {

        if (correctAnswer == null) {
            throw new IllegalStateException(
                    "AI returned a question without a correct answer"
            );
        }

        String answer = correctAnswer.trim().toUpperCase();

        if (!answer.matches("[ABCD]")) {
            throw new IllegalStateException(
                    "AI returned an invalid correct answer"
            );
        }

        return answer;
    }

    private QuestionResponse toQuestionResponse(Question question) {

        return new QuestionResponse(
                question.getId(),
                question.getQuestionText(),
                question.getOptionA(),
                question.getOptionB(),
                question.getOptionC(),
                question.getOptionD()
        );
    }

    private AiQuizData buildFallbackQuizData(AiQuizGenerateRequest request) {
        String topic = (request.getTopic() != null && !request.getTopic().isBlank()) ? request.getTopic().trim() : "General";
        int count = request.getNumberOfQuestions() > 0 ? request.getNumberOfQuestions() : 5;
        String difficulty = (request.getDifficulty() != null && !request.getDifficulty().isBlank()) ? request.getDifficulty() : "Standard";

        AiQuizData data = new AiQuizData();
        data.title = topic + " (" + difficulty + " Quiz)";
        data.description = "Test your core knowledge and understanding of " + topic + ".";
        data.questions = new java.util.ArrayList<>();

        String lowerTopic = topic.toLowerCase();
        if (lowerTopic.contains("java")) {
            addJavaQuestions(data.questions);
        } else if (lowerTopic.contains("python")) {
            addPythonQuestions(data.questions);
        }

        int idx = 1;
        while (data.questions.size() < count) {
            AiQuestionData q = new AiQuestionData();
            q.questionText = "Which of the following is a key fundamental principle when developing with " + topic + " (Concept #" + idx + ")?";
            q.optionA = "Maintaining modular, testable, and well-structured components.";
            q.optionB = "Storing unencrypted production credentials in public repositories.";
            q.optionC = "Bypassing error handling and exception logging completely.";
            q.optionD = "Hardcoding production endpoints directly into presentation logic.";
            q.correctAnswer = "A";
            data.questions.add(q);
            idx++;
        }

        if (data.questions.size() > count) {
            data.questions = new java.util.ArrayList<>(data.questions.subList(0, count));
        }

        return data;
    }

    private void addJavaQuestions(List<AiQuestionData> questions) {
        questions.add(createQ("What is the primary role of the Java Virtual Machine (JVM)?",
                "Execute Java bytecode across diverse operating systems",
                "Directly compile source code to machine-specific binary",
                "Act as a relational database storage engine",
                "Generate HTML documentation from Java source code", "A"));
        questions.add(createQ("Which keyword is used to prevent method overriding in Java?",
                "static", "final", "abstract", "volatile", "B"));
        questions.add(createQ("Which collection interface guarantees unique elements in Java?",
                "List", "Set", "Queue", "Deque", "B"));
        questions.add(createQ("What is the default bit size of an 'int' data type in Java?",
                "16 bits", "32 bits", "64 bits", "8 bits", "B"));
        questions.add(createQ("Which principle of OOP allows an object to take many forms?",
                "Encapsulation", "Polymorphism", "Inheritance", "Abstraction", "B"));
        questions.add(createQ("What happens when an unhandled runtime exception occurs in Java?",
                "The thread terminates and prints a stack trace",
                "The host operating system reboots",
                "The compiler produces a syntax error",
                "The database reverts historical transactions", "A"));
        questions.add(createQ("Which method serves as the standard entry point for Java applications?",
                "public void start(String[] args)",
                "public static void main(String[] args)",
                "public void init()",
                "public static void execute(String[] args)", "B"));
        questions.add(createQ("Which access modifier provides the widest visibility in Java?",
                "private", "protected", "package-private", "public", "D"));
        questions.add(createQ("Which of the following is an immutable class in Java standard library?",
                "StringBuilder", "StringBuffer", "String", "ArrayList", "C"));
        questions.add(createQ("What is the purpose of the 'finally' block in exception handling?",
                "To execute cleanup code regardless of whether an exception occurred",
                "To catch checked exceptions exclusively",
                "To restart the JVM process",
                "To suppress compiler warnings", "A"));
    }

    private void addPythonQuestions(List<AiQuestionData> questions) {
        questions.add(createQ("What keyword is used to define a function in Python?",
                "def", "func", "function", "lambda", "A"));
        questions.add(createQ("Which built-in Python collection type is immutable?",
                "list", "tuple", "dict", "set", "B"));
        questions.add(createQ("How are code blocks demarcated in Python syntax?",
                "Curly braces {}", "Indentation", "Parentheses ()", "begin/end keywords", "B"));
        questions.add(createQ("Which built-in function returns the number of items in a sequence?",
                "count()", "size()", "len()", "length()", "C"));
        questions.add(createQ("What is the evaluated boolean value of bool([]) in Python?",
                "True", "False", "None", "SyntaxError", "B"));
    }

    private AiQuestionData createQ(String text, String a, String b, String c, String d, String ans) {
        AiQuestionData q = new AiQuestionData();
        q.questionText = text;
        q.optionA = a;
        q.optionB = b;
        q.optionC = c;
        q.optionD = d;
        q.correctAnswer = ans;
        return q;
    }

    /*
     * These classes represent the JSON structure expected from the AI.
     * They are private because they are only used internally while
     * converting the AI response into database entities.
     */
    private static class AiQuizData {

        public String title;
        public String description;
        public List<AiQuestionData> questions;
    }

    private static class AiQuestionData {

        public String questionText;
        public String optionA;
        public String optionB;
        public String optionC;
        public String optionD;
        public String correctAnswer;
    }
}
