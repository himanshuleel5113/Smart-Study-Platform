package com.smartstudy.quizservice.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Column;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "quiz_answers")
public class QuizAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Identifies the quiz attempt this answer belongs to.
    private Long attemptId;

    // Identifies the question that was answered.
    private Long questionId;

    // Stores the option selected by the student: A, B, C, or D.
    private String selectedAnswer;

    // Snapshot the marked answers so reviews survive deletion of the source quiz.
    @Column(columnDefinition = "text")
    private String questionText;
    @Column(columnDefinition = "text")
    private String selectedOptionText;
    private String correctAnswer;
    @Column(columnDefinition = "text")
    private String correctOptionText;

    public void snapshot(Question question) {
        questionText = question.getQuestionText();
        correctAnswer = question.getCorrectAnswer();
        selectedOptionText = optionText(question, selectedAnswer);
        correctOptionText = optionText(question, correctAnswer);
    }

    private String optionText(Question question, String answer) {
        return switch (answer) {
            case "A" -> question.getOptionA();
            case "B" -> question.getOptionB();
            case "C" -> question.getOptionC();
            case "D" -> question.getOptionD();
            default -> null;
        };
    }

    public String getQuestionText() { return questionText; }
    public String getSelectedOptionText() { return selectedOptionText; }
    public String getCorrectAnswer() { return correctAnswer; }
    public String getCorrectOptionText() { return correctOptionText; }

    public QuizAnswer() {
    }

    public QuizAnswer(
            Long attemptId,
            Long questionId,
            String selectedAnswer) {

        this.attemptId = attemptId;
        this.questionId = questionId;
        this.selectedAnswer = selectedAnswer;
    }

    public Long getId() {
        return id;
    }

    public Long getAttemptId() {
        return attemptId;
    }

    public void setAttemptId(Long attemptId) {
        this.attemptId = attemptId;
    }

    public Long getQuestionId() {
        return questionId;
    }

    public void setQuestionId(Long questionId) {
        this.questionId = questionId;
    }

    public String getSelectedAnswer() {
        return selectedAnswer;
    }

    public void setSelectedAnswer(String selectedAnswer) {
        this.selectedAnswer = selectedAnswer;
    }
}
