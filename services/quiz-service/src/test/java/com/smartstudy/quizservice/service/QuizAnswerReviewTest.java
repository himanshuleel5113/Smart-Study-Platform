package com.smartstudy.quizservice.service;

import com.smartstudy.quizservice.model.*;
import com.smartstudy.quizservice.repository.*;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class QuizAnswerReviewTest {
    private final QuizAttemptRepository attempts = mock(QuizAttemptRepository.class);
    private final QuizAnswerRepository answers = mock(QuizAnswerRepository.class);
    private final QuestionRepository questions = mock(QuestionRepository.class);
    private final QuizAttemptService service = new QuizAttemptService(attempts, answers, questions);

    private void ownAttempt() {
        when(attempts.findByIdAndUserId(11L, 1L))
                .thenReturn(Optional.of(new QuizAttempt(1L, 5L, 0, 1, Instant.now())));
    }

    @Test void reviewUsesSavedSnapshotEvenAfterSourceQuestionIsDeleted() {
        ownAttempt();
        QuizAnswer answer = new QuizAnswer(11L, 7L, "A");
        answer.snapshot(new Question(5L, "Which option?", "Wrong", "Right", "C", "D", "B"));
        when(answers.findByAttemptId(11L)).thenReturn(List.of(answer));
        var review = service.getReview(1L, 11L).answers().getFirst();
        assertEquals("Wrong", review.selectedOptionText());
        assertEquals("Right", review.correctOptionText());
        assertFalse(review.correct());
        verifyNoInteractions(questions);
    }

    @Test void anotherUserCannotRetrieveAnswersOrCorrectOptions() {
        assertThrows(IllegalArgumentException.class, () -> service.getReview(2L, 11L));
        verifyNoInteractions(answers, questions);
    }

    @Test void oldAttemptUsesExistingQuestionAndReportsMissingDetailsHonestly() {
        ownAttempt();
        QuizAnswer known = new QuizAnswer(11L, 7L, "A");
        QuizAnswer deleted = new QuizAnswer(11L, 8L, "C");
        when(answers.findByAttemptId(11L)).thenReturn(List.of(deleted, known));
        when(questions.findById(7L)).thenReturn(Optional.of(
                new Question(5L, "Question", "Right", "B", "C", "D", "A")));
        var review = service.getReview(1L, 11L).answers();
        assertTrue(review.getFirst().correct());
        assertEquals("C", review.get(1).selectedAnswer());
        assertNull(review.get(1).correct());
        assertNull(review.get(1).questionText());
    }
}
