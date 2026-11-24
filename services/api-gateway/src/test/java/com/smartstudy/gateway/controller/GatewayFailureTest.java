package com.smartstudy.gateway.controller;

import com.smartstudy.gateway.security.JwtAuthenticationFilter;
import com.smartstudy.gateway.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestTemplate;
import java.io.IOException;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GatewayFailureTest {
    @Test void downstreamOutageReturns503WithoutInvalidatingAuthentication() throws Exception {
        RestTemplate rest = new RestTemplate();
        MockRestServiceServer upstream = MockRestServiceServer.createServer(rest);
        JwtService jwt = mock(JwtService.class);
        when(jwt.isTokenValid("valid")).thenReturn(true);
        when(jwt.extractUserId("valid")).thenReturn(1L);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserGatewayController(rest, "http://users"))
                .setControllerAdvice(new GatewayExceptionHandler())
                .addFilters(new JwtAuthenticationFilter(jwt)).build();
        upstream.expect(requestTo("http://users/api/users/profile"))
                .andRespond(withException(new IOException("Connection refused")));
        mvc.perform(get("/api/users/profile").header("Authorization", "Bearer valid"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("A service is temporarily unavailable. Please try again shortly."));
        upstream.verify();
    }

    @Test void accountMutationsForwardAuthorizationAndValidationErrors() throws Exception {
        RestTemplate rest = new RestTemplate();
        MockRestServiceServer upstream = MockRestServiceServer.createServer(rest);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new UserGatewayController(rest, "http://users")).build();
        upstream.expect(requestTo("http://users/api/users/profile"))
                .andExpect(method(org.springframework.http.HttpMethod.PUT))
                .andExpect(header("Authorization", "Bearer valid"))
                .andRespond(withSuccess("{\"name\":\"Updated\"}", MediaType.APPLICATION_JSON));
        upstream.expect(requestTo("http://users/api/users/password"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer valid"))
                .andRespond(withBadRequest().body("{\"message\":\"Password is too short\"}"));
        mvc.perform(put("/api/users/profile").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Updated\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Updated"));
        mvc.perform(post("/api/users/password").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Password is too short"));
        upstream.verify();
    }
}
