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
            aiText = callGemini(prompt, activeGeminiKey.trim());
        } else {
            ResponseCreateParams params = ResponseCreateParams.builder()
                    .input(prompt)
                    .model(deployment)
                    .build();

            var response = openAIClient.responses().create(params);
            aiText = extractText(response);
        }

        AiQuizData quizData = parseResponse(aiText);

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
