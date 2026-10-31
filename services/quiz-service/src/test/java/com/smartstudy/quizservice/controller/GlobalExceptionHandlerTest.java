package com.smartstudy.quizservice.controller;

import com.openai.errors.OpenAIException;
import com.openai.errors.UnauthorizedException;
import com.smartstudy.quizservice.dto.AiQuizGenerateRequest;
import com.smartstudy.quizservice.service.AiQuizService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AiQuizController.class)
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AiQuizService aiQuizService;

    private static final String REQUEST_JSON = """
            {
              "topic": "Kubernetes",
              "numberOfQuestions": 3,
              "difficulty": "easy"
            }
            """;

    @Test
    void invalidAzureKeyShouldReturnServiceUnavailableWithClearMessage()
            throws Exception {

        UnauthorizedException unauthorized =
                mock(UnauthorizedException.class);

        when(unauthorized.getMessage())
                .thenReturn("401: Access denied due to invalid subscription key");

        when(aiQuizService.generateQuiz(
                eq(1L),
                any(AiQuizGenerateRequest.class)
        )).thenThrow(unauthorized);

        mockMvc.perform(
                        post("/api/ai-quizzes/generate")
                                .param("userId", "1")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(REQUEST_JSON)
                )
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value(
                        "AI quiz generation is unavailable: the AI service rejected "
                                + "the configured credentials. Please verify the "
                                + "AZURE_OPENAI_KEY configuration."));
    }

    @Test
    void otherAiProviderErrorsShouldReturnServiceUnavailable()
            throws Exception {

        when(aiQuizService.generateQuiz(
                eq(1L),
                any(AiQuizGenerateRequest.class)
        )).thenThrow(new OpenAIException("429: rate limited by the AI provider"));

        mockMvc.perform(
                        post("/api/ai-quizzes/generate")
                                .param("userId", "1")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(REQUEST_JSON)
                )
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message")
                        .value("AI quiz generation is currently unavailable. "
                                + "Please try again later."));
    }

    @Test
    void unusableAiResponseShouldReturnBadGateway()
            throws Exception {

        when(aiQuizService.generateQuiz(
                eq(1L),
                any(AiQuizGenerateRequest.class)
        )).thenThrow(new IllegalStateException(
                "AI returned an invalid quiz format"));

        mockMvc.perform(
                        post("/api/ai-quizzes/generate")
                                .param("userId", "1")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(REQUEST_JSON)
                )
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message")
                        .value("AI returned an invalid quiz format"));
    }
}
