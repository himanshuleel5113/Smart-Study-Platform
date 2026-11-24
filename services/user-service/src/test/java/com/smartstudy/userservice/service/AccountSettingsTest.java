package com.smartstudy.userservice.service;

import com.smartstudy.userservice.dto.LoginRequest;
import com.smartstudy.userservice.exception.AuthenticationException;
import com.smartstudy.userservice.model.User;
import com.smartstudy.userservice.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountSettingsTest {
    private final UserRepository repository = mock(UserRepository.class);
    private final JwtService jwt = mock(JwtService.class);
    private final UserService service = new UserService(repository, jwt);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    private User signedInUser() {
        User user = new User("Student", "student@example.test", encoder.encode("OldPassword123!"));
        when(jwt.isTokenValid("token")).thenReturn(true);
        when(jwt.extractEmail("token")).thenReturn(user.getEmail());
        when(repository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        return user;
    }

    @Test void profileUpdatePersistsNameWithoutChangingIdentity() {
        User user = signedInUser();
        var profile = service.updateProfile("token", "  Updated Student  ");
        assertEquals("Updated Student", profile.getName());
        assertEquals("student@example.test", profile.getEmail());
        verify(repository).save(user);
    }

    @Test void invalidTokenCannotUpdateProfile() {
        assertThrows(AuthenticationException.class, () -> service.updateProfile("invalid", "Name"));
        verifyNoInteractions(repository);
    }

    @Test void passwordChangeRequiresCurrentPasswordAndPersistsOnlyHash() {
        User user = signedInUser();
        String originalHash = user.getPassword();
        assertThrows(AuthenticationException.class,
                () -> service.changePassword("token", "wrong", "NewPassword123!"));
        assertEquals(originalHash, user.getPassword());
        verify(repository, never()).save(any());
        service.changePassword("token", "OldPassword123!", "NewPassword123!");
        assertTrue(encoder.matches("NewPassword123!", user.getPassword()));
        assertFalse(encoder.matches("OldPassword123!", user.getPassword()));
        verify(repository).save(user);
    }

    @Test void passwordsBeyondBcryptByteLimitAreRejectedBeforePersistence() {
        assertThrows(IllegalArgumentException.class,
                () -> service.changePassword("token", "OldPassword123!", "é".repeat(37)));
        assertThrows(IllegalArgumentException.class,
                () -> service.register(new User("Student", "s@example.test", "x".repeat(73))));
        verifyNoInteractions(repository);
    }

    @Test void registrationRecordsTimeButLoginDoesNotInventLegacyRegistrationDate() {
        when(repository.save(any())).thenAnswer(call -> call.getArgument(0));
        User registered = service.register(new User("New", "new@example.test", "Password123!"));
        assertNotNull(registered.getCreatedAt());
        User legacy = new User("Legacy", "old@example.test", encoder.encode("Password123!"));
        when(repository.findByEmail(legacy.getEmail())).thenReturn(Optional.of(legacy));
        LoginRequest login = new LoginRequest();
        login.setEmail(legacy.getEmail());
        login.setPassword("Password123!");
        service.login(login);
        assertNull(legacy.getCreatedAt());
        assertNotNull(legacy.getLastLoginAt());
    }
}
