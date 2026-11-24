package com.smartstudy.quizservice.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.openai.client.OpenAIClient;
import com.openai.models.responses.*;
import com.openai.services.blocking.ResponseService;
import com.smartstudy.quizservice.dto.AiQuizGenerateRequest;
import com.smartstudy.quizservice.repository.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiQuizValidationTest {
    @ParameterizedTest
    @ValueSource(strings = {
            "null", "{\"title\":\"Quiz\",\"questions\":[null]}",
            "{\"title\":\"Quiz\",\"questions\":[{\"questionText\":\"Q\",\"correctAnswer\":\"A\"}]}",
            "{\"title\":\"Quiz\",\"questions\":[]}",
            "{\"title\":\"Quiz\",\"questions\":[{},{}]}"
    })
    void invalidProviderContentNeverCreatesPartialQuiz(String json) {
        OpenAIClient client = mock(OpenAIClient.class);
        ResponseService responses = mock(ResponseService.class);
        Response response = mock(Response.class);
        QuizRepository quizzes = mock(QuizRepository.class);
        QuestionRepository questions = mock(QuestionRepository.class);
        when(client.responses()).thenReturn(responses);
        when(responses.create(any(ResponseCreateParams.class))).thenReturn(response);
        var message = ResponseOutputMessage.builder().id("message")
                .status(ResponseOutputMessage.Status.COMPLETED)
                .addContent(ResponseOutputText.builder().text(json).annotations(List.of()).build()).build();
        when(response.output()).thenReturn(List.of(ResponseOutputItem.ofMessage(message)));
        AiQuizGenerateRequest request = new AiQuizGenerateRequest();
        request.setTopic("Java");
        request.setDifficulty("easy");
        request.setNumberOfQuestions(1);
        AiQuizService service = new AiQuizService(client, new ObjectMapper(), quizzes, questions);
        assertThrows(IllegalStateException.class, () -> service.generateQuiz(1L, request));
        verifyNoInteractions(quizzes, questions);
    }
}
