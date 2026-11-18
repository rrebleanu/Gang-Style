package ro.gangstyle.api.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import ro.gangstyle.api.model.User;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

// Utility for generating, parsing, and validating JSON Web Tokens.
@Component
public class JwtUtil {

    private static final long PRE_AUTH_EXPIRATION_MS = 300_000L; // 5 minutes for 2FA verification

    private final SecretKey key;
    private final long expirationMs;
    private final Set<String> invalidatedTokens = ConcurrentHashMap.newKeySet();

    public JwtUtil(
            @Value("${gangstyle.jwt.secret}") String secret,
            @Value("${gangstyle.jwt.expiration-ms:604800000}") long expirationMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    // Creates a full signed JWT containing user email as subject and role as claim.
    public String generateToken(User user) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(user.getEmail())
                .claim("role", user.getRole())
                .claim("displayName", user.getDisplayName())
                .claim("preAuth", false)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(key)
                .compact();
    }

    // Creates a temporary pre-authentication token for users who still need to verify their 2FA code.
    public String generatePreAuthToken(User user) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + PRE_AUTH_EXPIRATION_MS);

        return Jwts.builder()
                .subject(user.getEmail())
                .claim("role", "ROLE_PRE_AUTH")
                .claim("displayName", user.getDisplayName())
                .claim("preAuth", true)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(key)
                .compact();
    }

    public String extractEmail(String token) {
        return getClaims(token).getSubject();
    }

    public String extractRole(String token) {
        return getClaims(token).get("role", String.class);
    }

    // Checks if the token represents an incomplete 2FA login state.
    public boolean isPreAuthToken(String token) {
        try {
            Claims claims = getClaims(token);
            Boolean preAuth = claims.get("preAuth", Boolean.class);
            String role = claims.get("role", String.class);
            return Boolean.TRUE.equals(preAuth) || "ROLE_PRE_AUTH".equals(role);
        } catch (JwtException | IllegalArgumentException ex) {
            return false;
        }
    }

    // Marks a token as revoked on logout or after 2FA exchange.
    public void invalidateToken(String token) {
        if (token != null && !token.isBlank()) {
            invalidatedTokens.add(token.trim());
        }
    }

    // Validates cryptographic signature, expiration date, and revocation state.
    public boolean validateToken(String token) {
        if (token == null || invalidatedTokens.contains(token.trim())) {
            return false;
        }
        try {
            Claims claims = getClaims(token);
            return !claims.getExpiration().before(new Date());
        } catch (JwtException | IllegalArgumentException ex) {
            return false;
        }
    }

    private Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
