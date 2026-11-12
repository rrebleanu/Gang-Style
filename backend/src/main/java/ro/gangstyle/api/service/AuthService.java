package ro.gangstyle.api.service;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import ro.gangstyle.api.dto.AuthResponseDto;
import ro.gangstyle.api.dto.LoginRequestDto;
import ro.gangstyle.api.dto.RegisterRequestDto;
import ro.gangstyle.api.model.User;
import ro.gangstyle.api.repository.UserRepository;
import ro.gangstyle.api.security.JwtUtil;

import java.time.Instant;

/**
 * Service managing user login and registration with BCrypt hashing and JWT token issuance.
 */
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    /**
     * Authenticates a user against BCrypt hash in MongoDB and returns JWT.
     */
    public AuthResponseDto login(LoginRequestDto request) {
        String normalizedEmail = request.getEmail().toLowerCase().trim();

        User user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new BadCredentialsException("Emailul sau parola introdusă este incorectă."));

        // Verify plain password against BCrypt hash stored in MongoDB
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BadCredentialsException("Emailul sau parola introdusă este incorectă.");
        }

        String token = jwtUtil.generateToken(user);
        return new AuthResponseDto(
                token,
                user.getEmail(),
                user.getDisplayName(),
                user.getPhone(),
                user.getRole()
        );
    }

    /**
     * Registers a new client account (role is strictly enforced as ROLE_CLIENT).
     */
    public AuthResponseDto register(RegisterRequestDto request) {
        String normalizedEmail = request.getEmail().toLowerCase().trim();

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new IllegalArgumentException("Există deja un cont creat cu această adresă de email.");
        }

        // Create new user with BCrypt hashed password and enforced ROLE_CLIENT
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
                savedUser.getRole()
        );
    }
}
