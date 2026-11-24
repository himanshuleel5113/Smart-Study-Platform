package com.smartstudy.userservice.dto;

import java.time.Instant;

public class UserProfileResponse {

    private Long id;
    private String name;
    private String email;

    // Null for accounts created before these fields existed.
    private Instant createdAt;
    private Instant lastLoginAt;

    public UserProfileResponse() {
    }

    public UserProfileResponse(Long id, String name, String email) {
        this(id, name, email, null, null);
    }

    public UserProfileResponse(
            Long id,
            String name,
            String email,
            Instant createdAt,
            Instant lastLoginAt) {

        this.id = id;
        this.name = name;
        this.email = email;
        this.createdAt = createdAt;
        this.lastLoginAt = lastLoginAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
}