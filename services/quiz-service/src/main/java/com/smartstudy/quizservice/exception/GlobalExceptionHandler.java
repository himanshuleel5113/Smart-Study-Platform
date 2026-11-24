package com.smartstudy.quizservice.exception;

import com.openai.errors.OpenAIException;
import com.openai.errors.UnauthorizedException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, String>> handleMalformedRequest(Exception exception) {
        return buildResponse(HttpStatus.BAD_REQUEST, "The request contains missing or invalid data.");
    }

    @ExceptionHandler(QuizConflictException.class)
    public ResponseEntity<Map<String, String>> handleQuizConflict(QuizConflictException exception) {
        return buildResponse(HttpStatus.CONFLICT, exception.getMessage());
    }

    // The Azure OpenAI credentials are missing or rejected. The service is
    // correctly configured but the AI provider refuses the request, so this
    // is reported as "service unavailable" rather than a client mistake.
    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Map<String, String>> handleAiUnauthorized(
            UnauthorizedException exception) {

        return buildResponse(
                HttpStatus.SERVICE_UNAVAILABLE,
                "AI quiz generation is unavailable: the AI service rejected the "
                        + "configured credentials. Please verify the AZURE_OPENAI_KEY "
                        + "configuration."
        );
    }

    // Any other Azure OpenAI API problem (rate limits, outages, bad requests
    // to the AI provider).
    @ExceptionHandler(OpenAIException.class)
    public ResponseEntity<Map<String, String>> handleAiServiceError(
            OpenAIException exception) {

        return buildResponse(
                HttpStatus.SERVICE_UNAVAILABLE,
                "AI quiz generation is currently unavailable. Please try again later."
        );
    }

    // The AI replied but with unusable content (bad JSON, no questions, etc.),
    // or a quiz genuinely has no questions to submit against.
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleIllegalState(
            IllegalStateException exception) {

        return buildResponse(
                HttpStatus.BAD_GATEWAY,
                exception.getMessage() != null
                        ? exception.getMessage()
                        : "The request could not be completed. Please try again."
        );
    }

    // Client mistakes: unknown quiz, invalid answer letters, etc.
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(
            IllegalArgumentException exception) {

        return buildResponse(
                HttpStatus.BAD_REQUEST,
                exception.getMessage() != null
                        ? exception.getMessage()
                        : "The request was invalid."
        );
    }

    // Bean Validation failures (e.g. submitting a quiz with no answers).
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidationError(
            MethodArgumentNotValidException exception) {

        String message = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .findFirst()
                .map(error -> error.getDefaultMessage())
                .orElse("The request was invalid.");

        return buildResponse(HttpStatus.BAD_REQUEST, message);
    }

    // Safety net so no unhandled exception leaks a stack trace to clients.
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(
            Exception exception) {

        return buildResponse(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "An unexpected error occurred. Please try again."
        );
    }

    private ResponseEntity<Map<String, String>> buildResponse(
            HttpStatus status,
            String message) {

        Map<String, String> response = new HashMap<>();

        response.put("message", message);

        return ResponseEntity.status(status).body(response);
    }
}
