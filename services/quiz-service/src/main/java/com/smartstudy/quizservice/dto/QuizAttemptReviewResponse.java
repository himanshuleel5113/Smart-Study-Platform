package com.smartstudy.quizservice.dto;

import java.util.List;

public record QuizAttemptReviewResponse(Long attemptId, List<QuizAnswerReviewResponse> answers) {
}
