package com.smartstudy.quizservice.exception;

public class QuizConflictException extends IllegalStateException {
    public QuizConflictException(String message) {
        super(message);
    }
}
