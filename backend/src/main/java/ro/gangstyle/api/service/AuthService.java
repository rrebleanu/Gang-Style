package ro.gangstyle.api.service;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import ro.gangstyle.api.dto.AuthResponseDto;
import ro.gangstyle.api.dto.LoginRequestDto;
import ro.gangstyle.api.dto.RegisterRequestDto;
import ro.gangstyle.api.dto.TwoFactorSetupResponseDto;
import ro.gangstyle.api.dto.TwoFactorVerifyRequestDto;
import ro.gangstyle.api.exception.ResourceNotFoundException;
import ro.gangstyle.api.model.User;
import ro.gangstyle.api.repository.UserRepository;
import ro.gangstyle.api.security.JwtUtil;
import ro.gangstyle.api.security.TotpService;
import ro.gangstyle.api.security.TwoFactorRateLimiter;

import java.time.Instant;
import java.util.Map;

// Service managing user login, registration, logout, and TOTP two-factor authentication.
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final TotpService totpService;
    private final TwoFactorRateLimiter twoFactorRateLimiter;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtUtil jwtUtil,
            TotpService totpService,
            TwoFactorRateLimiter twoFactorRateLimiter) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.totpService = totpService;
        this.twoFactorRateLimiter = twoFactorRateLimiter;
    }

    // Authenticates user credentials and returns either a pre-auth token (if 2FA is active) or a full JWT.
    public AuthResponseDto login(LoginRequestDto request) {
        String normalizedEmail = request.getEmail().toLowerCase().trim();

        User user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new BadCredentialsException("Emailul sau parola introdusă este incorectă."));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BadCredentialsException("Emailul sau parola introdusă este incorectă.");
        }

        if (user.isTwoFactorEnabled() && user.getTwoFactorSecret() != null && !user.getTwoFactorSecret().isBlank()) {
            String preAuthToken = jwtUtil.generatePreAuthToken(user);
            return new AuthResponseDto(
                    preAuthToken,
                    user.getEmail(),
                    user.getDisplayName(),
                    user.getPhone(),
                    "ROLE_PRE_AUTH",
                    true,
                    true
            );
        }

        String token = jwtUtil.generateToken(user);
        return new AuthResponseDto(
                token,
                user.getEmail(),
                user.getDisplayName(),
                user.getPhone(),
                user.getRole(),
                false,
                user.isTwoFactorEnabled()
        );
    }

    // Registers a new client account with ROLE_CLIENT.
    public AuthResponseDto register(RegisterRequestDto request) {
        String normalizedEmail = request.getEmail().toLowerCase().trim();

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new IllegalArgumentException("Există deja un cont creat cu această adresă de email.");
        }

        User newUser = new User(
                normalizedEmail,
                passwordEncoder.encode(request.getPassword()),
                request.getDisplayName().trim(),
                request.getPhone().trim(),
                "ROLE_CLIENT",
                Instant.now()
        );

        User savedUser = userRepository.save(newUser);
        String token = jwtUtil.generateToken(savedUser);

        return new AuthResponseDto(
                token,
                savedUser.getEmail(),
                savedUser.getDisplayName(),
                savedUser.getPhone(),
                savedUser.getRole(),
                false,
                false
        );
    }

    // Generates a new TOTP secret and QR code for the authenticated user.
    public TwoFactorSetupResponseDto setupTwoFactor(String email) {
        User user = findUserByEmail(email);

        String secret = totpService.generateSecret();
        user.setTwoFactorSecret(secret);
        userRepository.save(user);

        String otpAuthUri = totpService.buildOtpAuthUri(user.getEmail(), secret);
        String qrCodeDataUrl = totpService.generateQrCodeDataUrl(otpAuthUri);

        return new TwoFactorSetupResponseDto(
                secret,
                otpAuthUri,
                qrCodeDataUrl,
                user.isTwoFactorEnabled()
        );
    }

    // Verifies the TOTP code and enables 2FA on the user's account.
    public Map<String, Object> enableTwoFactor(String email, String code) {
        twoFactorRateLimiter.checkAllowed(email);
        User user = findUserByEmail(email);

        if (user.getTwoFactorSecret() == null || user.getTwoFactorSecret().isBlank()) {
            throw new IllegalArgumentException("Nu există o configurare 2FA inițiată. Generează mai întâi codul QR.");
        }

        if (!totpService.verifyCode(user.getTwoFactorSecret(), code)) {
            twoFactorRateLimiter.recordFailedAttempt(email);
            throw new BadCredentialsException("Codul 2FA introdus este invalid sau a expirat.");
        }

        twoFactorRateLimiter.resetAttempts(email);
        user.setTwoFactorEnabled(true);
        userRepository.save(user);

        return Map.of(
                "message", "Autentificarea în doi pași (2FA) a fost activată cu succes.",
                "twoFactorEnabled", true
        );
    }

    // Completes login from the incomplete pre-auth state by verifying the 6-digit TOTP code.
    public AuthResponseDto verifyTwoFactor(String authHeader, TwoFactorVerifyRequestDto request) {
        String preAuthToken = extractToken(authHeader, request.getTempToken());

        if (preAuthToken == null || !jwtUtil.validateToken(preAuthToken)) {
            throw new BadCredentialsException("Sesiunea de verificare 2FA este invalidă sau a expirat. Te rugăm să te reconectezi.");
        }

        String email = jwtUtil.extractEmail(preAuthToken);
        twoFactorRateLimiter.checkAllowed(email);

        User user = findUserByEmail(email);
        if (user.getTwoFactorSecret() == null || user.getTwoFactorSecret().isBlank()) {
            throw new IllegalArgumentException("Contul nu are configurat un secret 2FA.");
        }

        if (!totpService.verifyCode(user.getTwoFactorSecret(), request.getCode())) {
            twoFactorRateLimiter.recordFailedAttempt(email);
            throw new BadCredentialsException("Codul 2FA introdus este invalid sau a expirat.");
        }

        twoFactorRateLimiter.resetAttempts(email);
        jwtUtil.invalidateToken(preAuthToken);

        if (!user.isTwoFactorEnabled()) {
            user.setTwoFactorEnabled(true);
            userRepository.save(user);
        }

        String fullToken = jwtUtil.generateToken(user);
        return new AuthResponseDto(
                fullToken,
                user.getEmail(),
                user.getDisplayName(),
                user.getPhone(),
                user.getRole(),
                false,
                true
        );
    }

    // Disables 2FA on the user's account after verifying a valid TOTP code.
    public Map<String, Object> disableTwoFactor(String email, String code) {
        twoFactorRateLimiter.checkAllowed(email);
        User user = findUserByEmail(email);

        if (!user.isTwoFactorEnabled() || user.getTwoFactorSecret() == null) {
            throw new IllegalArgumentException("Autentificarea în doi pași (2FA) nu este activă pe acest cont.");
        }

        if (!totpService.verifyCode(user.getTwoFactorSecret(), code)) {
            twoFactorRateLimiter.recordFailedAttempt(email);
            throw new BadCredentialsException("Codul 2FA introdus este invalid sau a expirat.");
        }

        twoFactorRateLimiter.resetAttempts(email);
        user.setTwoFactorEnabled(false);
        user.setTwoFactorSecret(null);
        userRepository.save(user);

        return Map.of(
                "message", "Autentificarea în doi pași (2FA) a fost dezactivată.",
                "twoFactorEnabled", false
        );
    }

    // Returns the current 2FA status for the authenticated user.
    public Map<String, Object> getTwoFactorStatus(String email) {
        User user = findUserByEmail(email);
        return Map.of(
                "email", user.getEmail(),
                "role", user.getRole(),
                "twoFactorEnabled", user.isTwoFactorEnabled()
        );
    }

    // Revokes the active JWT and clears the security context.
    public void logout(String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            jwtUtil.invalidateToken(token);
        }
        SecurityContextHolder.clearContext();
    }

    private User findUserByEmail(String email) {
        return userRepository.findByEmail(email.toLowerCase().trim())
                .orElseThrow(() -> new ResourceNotFoundException("Utilizatorul nu a fost găsit."));
    }

    private String extractToken(String authHeader, String fallbackToken) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7).trim();
        }
        if (fallbackToken != null && !fallbackToken.isBlank()) {
            return fallbackToken.trim();
        }
        return null;
    }
}
