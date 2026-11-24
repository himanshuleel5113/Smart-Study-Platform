package com.smartstudy.quizservice.repository;

import com.smartstudy.quizservice.model.QuizAttempt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface QuizAttemptRepository
        extends JpaRepository<QuizAttempt, Long> {

    Optional<QuizAttempt> findByIdAndUserId(Long id, Long userId);

    List<QuizAttempt> findByUserIdOrderByCompletedAtDesc(Long userId);

    List<QuizAttempt> findByQuizIdOrderByCompletedAtDesc(Long quizId);

    List<QuizAttempt> findByUserIdAndQuizIdOrderByCompletedAtDesc(
            Long userId,
            Long quizId
    );
}
