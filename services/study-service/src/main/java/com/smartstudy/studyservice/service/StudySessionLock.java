package com.smartstudy.studyservice.service;

import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class StudySessionLock {
    private final JdbcTemplate jdbc;

    public StudySessionLock(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Called inside the service transaction. The database releases this lock at
    // commit/rollback; it also serializes requests handled by different replicas.
    public void acquire(Long userId) {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement("SELECT pg_advisory_xact_lock(?)")) {
                statement.setLong(1, userId);
                statement.execute();
            }
            return null;
        });
    }
}
