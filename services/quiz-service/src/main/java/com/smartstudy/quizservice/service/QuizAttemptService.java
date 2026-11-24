package com.smartstudy.quizservice.service;

import com.smartstudy.quizservice.dto.QuizAttemptResponse;
import com.smartstudy.quizservice.dto.QuizAnswerReviewResponse;
import com.smartstudy.quizservice.dto.QuizAttemptReviewResponse;
import com.smartstudy.quizservice.repository.QuizAnswerRepository;
import com.smartstudy.quizservice.repository.QuestionRepository;
import com.smartstudy.quizservice.model.QuizAnswer;
import org.springframework.transaction.annotation.Transactional;
import com.smartstudy.quizservice.model.QuizAttempt;
import com.smartstudy.quizservice.repository.QuizAttemptRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class QuizAttemptService {

    private final QuizAttemptRepository quizAttemptRepository;
    private final QuizAnswerRepository quizAnswerRepository;
    private final QuestionRepository questionRepository;

    public QuizAttemptService(QuizAttemptRepository quizAttemptRepository,
            QuizAnswerRepository quizAnswerRepository, QuestionRepository questionRepository) {
        this.quizAttemptRepository = quizAttemptRepository;
        this.quizAnswerRepository = quizAnswerRepository;
        this.questionRepository = questionRepository;
    }

    @Transactional(readOnly = true)
    public QuizAttemptReviewResponse getReview(Long userId, Long attemptId) {
        quizAttemptRepository.findByIdAndUserId(attemptId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Quiz attempt not found"));
        List<QuizAnswerReviewResponse> answers = quizAnswerRepository.findByAttemptId(attemptId)
                .stream().sorted(java.util.Comparator.comparing(QuizAnswer::getQuestionId))
                .map(answer -> {
                    // Older attempts have no snapshot; use the question if it still exists.
                    if (answer.getQuestionText() == null) {
                        questionRepository.findById(answer.getQuestionId()).ifPresent(answer::snapshot);
                    }
                    return new QuizAnswerReviewResponse(answer.getQuestionId(), answer.getQuestionText(),
                            answer.getSelectedAnswer(), answer.getSelectedOptionText(), answer.getCorrectAnswer(),
                            answer.getCorrectOptionText(), answer.getCorrectAnswer() == null ? null :
                            answer.getSelectedAnswer().equals(answer.getCorrectAnswer()));
                }).toList();
        return new QuizAttemptReviewResponse(attemptId, answers);
    }

    public List<QuizAttemptResponse> getUserAttempts(Long userId) {
        return quizAttemptRepository
                .findByUserIdOrderByCompletedAtDesc(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<QuizAttemptResponse> getQuizAttempts(Long userId, Long quizId) {
        return quizAttemptRepository
                .findByUserIdAndQuizIdOrderByCompletedAtDesc(userId, quizId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private QuizAttemptResponse toResponse(QuizAttempt attempt) {

        double percentage = 0.0;

        if (attempt.getTotalQuestions() > 0) {
            percentage =
                    ((double) attempt.getScore() / attempt.getTotalQuestions()) * 100.0;
        }

        return new QuizAttemptResponse(
                attempt.getId(),
                attempt.getQuizId(),
                attempt.getScore(),
                attempt.getTotalQuestions(),
                percentage,
                attempt.getCompletedAt()
        );
    }
}
