package ro.gangstyle.api.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ro.gangstyle.api.dto.AuthResponseDto;
import ro.gangstyle.api.dto.LoginRequestDto;
import ro.gangstyle.api.dto.RegisterRequestDto;
import ro.gangstyle.api.dto.TwoFactorSetupResponseDto;
import ro.gangstyle.api.dto.TwoFactorVerifyRequestDto;
import ro.gangstyle.api.service.AuthService;

import java.util.Map;

// Controller handling user authentication, registration, logout, and TOTP 2FA endpoints.
@RestController
@RequestMapping({"/api/auth", "/auth"})
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponseDto> login(@Valid @RequestBody LoginRequestDto request) {
        AuthResponseDto response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponseDto> register(@Valid @RequestBody RegisterRequestDto request) {
        AuthResponseDto response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        authService.logout(authHeader);
        return ResponseEntity.ok(Map.of("message", "Te-ai deconectat cu succes."));
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<TwoFactorSetupResponseDto> setupTwoFactor(Authentication authentication) {
        TwoFactorSetupResponseDto response = authService.setupTwoFactor(authentication.getName());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/2fa/enable")
    public ResponseEntity<Map<String, Object>> enableTwoFactor(
            Authentication authentication,
            @Valid @RequestBody TwoFactorVerifyRequestDto request) {
        Map<String, Object> response = authService.enableTwoFactor(authentication.getName(), request.getCode());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/2fa/verify")
    public ResponseEntity<AuthResponseDto> verifyTwoFactor(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @Valid @RequestBody TwoFactorVerifyRequestDto request) {
        AuthResponseDto response = authService.verifyTwoFactor(authHeader, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<Map<String, Object>> disableTwoFactor(
            Authentication authentication,
            @Valid @RequestBody TwoFactorVerifyRequestDto request) {
        Map<String, Object> response = authService.disableTwoFactor(authentication.getName(), request.getCode());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/2fa/status")
    public ResponseEntity<Map<String, Object>> getTwoFactorStatus(Authentication authentication) {
        Map<String, Object> response = authService.getTwoFactorStatus(authentication.getName());
        return ResponseEntity.ok(response);
    }
}
