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

    private final SecretKey key;
    private final long expirationMs;
    private final Set<String> invalidatedTokens = ConcurrentHashMap.newKeySet();

    public JwtUtil(
            @Value("${gangstyle.jwt.secret}") String secret,
            @Value("${gangstyle.jwt.expiration-ms:604800000}") long expirationMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    // Creates a signed JWT containing user email as subject and role as claim.
    public String generateToken(User user) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(user.getEmail())
                .claim("role", user.getRole())
                .claim("displayName", user.getDisplayName())
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

    // Marks a token as revoked on logout.
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
