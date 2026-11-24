package com.smartstudy.userservice.controller;

import com.smartstudy.userservice.dto.UserProfileResponse;
import com.smartstudy.userservice.exception.GlobalExceptionHandler;
import com.smartstudy.userservice.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AccountSettingsControllerTest {
    private final UserService service = mock(UserService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserController(service))
            .setControllerAdvice(new GlobalExceptionHandler()).build();

    @Test void profileUpdateValidatesBodyAndReturnsSavedProfile() throws Exception {
        when(service.updateProfile("token", "New Name"))
                .thenReturn(new UserProfileResponse(1L, "New Name", "s@example.test"));
        mvc.perform(put("/api/users/profile").header("Authorization", "Bearer token")
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"New Name\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("New Name"));
        mvc.perform(put("/api/users/profile").header("Authorization", "Bearer token")
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"   \"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
    }

    @Test void passwordChangeRequiresBearerHeaderAndValidPassword() throws Exception {
        String body = "{\"currentPassword\":\"OldPassword123!\",\"newPassword\":\"NewPassword123!\"}";
        mvc.perform(post("/api/users/password").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/users/password").header("Authorization", "Bearer token")
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNoContent());
        verify(service).changePassword("token", "OldPassword123!", "NewPassword123!");
        mvc.perform(post("/api/users/password").header("Authorization", "Bearer token")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"old\",\"newPassword\":\"short\"}"))
                .andExpect(status().isBadRequest());
    }
}
