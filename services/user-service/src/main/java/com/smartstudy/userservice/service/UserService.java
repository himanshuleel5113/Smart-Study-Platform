package com.smartstudy.userservice.service;

import com.smartstudy.userservice.dto.LoginRequest;
import com.smartstudy.userservice.dto.UserProfileResponse;
import com.smartstudy.userservice.exception.AuthenticationException;
import com.smartstudy.userservice.exception.DuplicateEmailException;
import com.smartstudy.userservice.model.User;
import com.smartstudy.userservice.repository.UserRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.nio.charset.StandardCharsets;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public UserService(UserRepository userRepository, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = new BCryptPasswordEncoder();
        this.jwtService = jwtService;
    }

    public User register(User user) {

        validateNewPassword(user.getPassword());

        // An email should belong to only one account.
        if (userRepository.findByEmail(user.getEmail()).isPresent()) {
            throw new DuplicateEmailException("Email is already registered");
        }

        // Never store the original password in the database.
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        user.setCreatedAt(Instant.now());

        return userRepository.save(user);
    }

    public String login(LoginRequest request) {

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() ->
                        new AuthenticationException("Invalid email or password"));

        // Compare the entered password with the BCrypt hash stored in PostgreSQL.
        if (request.getPassword() == null
                || request.getPassword().getBytes(StandardCharsets.UTF_8).length > 72
                || !passwordEncoder.matches(
                request.getPassword(),
                user.getPassword())) {

            throw new AuthenticationException("Invalid email or password");
        }

        // Track account activity for the profile page.
        Instant now = Instant.now();

        user.setLastLoginAt(now);

        userRepository.save(user);

        // Generate a signed JWT after successful authentication.
        return jwtService.generateToken(user.getId(), user.getEmail());
    }

    public UserProfileResponse getProfile(String token) {

        User user = getUserFromToken(token);

        return new UserProfileResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getCreatedAt(),
                user.getLastLoginAt()
        );
    }

    public UserProfileResponse updateProfile(String token, String newName) {

        if (newName == null || newName.isBlank() || newName.length() > 255) {
            throw new IllegalArgumentException("Name must contain 1 to 255 characters");
        }

        User user = getUserFromToken(token);

        user.setName(newName.trim());

        userRepository.save(user);

        return new UserProfileResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getCreatedAt(),
                user.getLastLoginAt()
        );
    }

    public void changePassword(
            String token,
            String currentPassword,
            String newPassword) {

        validateNewPassword(newPassword);

        User user = getUserFromToken(token);

        // The current password must be confirmed before it can be replaced.
        if (currentPassword == null
                || currentPassword.getBytes(StandardCharsets.UTF_8).length > 72
                || !passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new AuthenticationException("Current password is incorrect");
        }

        user.setPassword(passwordEncoder.encode(newPassword));

        userRepository.save(user);
    }

    private void validateNewPassword(String password) {
        if (password == null || password.isBlank() || password.length() < 8) {
            throw new IllegalArgumentException("Password must contain at least 8 characters");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("Password must be at most 72 UTF-8 bytes");
        }
    }

    private User getUserFromToken(String token) {

        if (!jwtService.isTokenValid(token)) {
            throw new AuthenticationException("Invalid or expired token");
        }

        String email = jwtService.extractEmail(token);

        return userRepository.findByEmail(email)
                .orElseThrow(() ->
                        new AuthenticationException("Invalid or expired token"));
    }
}
