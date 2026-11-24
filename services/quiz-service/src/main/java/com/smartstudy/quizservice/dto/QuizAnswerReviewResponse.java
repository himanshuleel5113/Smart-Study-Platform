package com.smartstudy.quizservice.dto;

public record QuizAnswerReviewResponse(Long questionId, String questionText,
        String selectedAnswer, String selectedOptionText, String correctAnswer,
        String correctOptionText, Boolean correct) {
}
