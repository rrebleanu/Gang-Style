package ro.gangstyle.api.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import ro.gangstyle.api.exception.TooManyAttemptsException;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

// Rate limiter protecting 2FA code verification against brute-force attacks.
@Component
public class TwoFactorRateLimiter {

    private final int maxAttempts;
    private final long lockoutSeconds;
    private final Map<String, AttemptRecord> attemptsByEmail = new ConcurrentHashMap<>();

    public TwoFactorRateLimiter(
            @Value("${gangstyle.security.2fa.max-attempts:5}") int maxAttempts,
            @Value("${gangstyle.security.2fa.lockout-seconds:300}") long lockoutSeconds) {
        this.maxAttempts = maxAttempts;
        this.lockoutSeconds = lockoutSeconds;
    }

    // Throws TooManyAttemptsException if the user is currently locked out.
    public void checkAllowed(String email) {
        String key = normalizeKey(email);
        AttemptRecord record = attemptsByEmail.get(key);
        if (record == null) {
            return;
        }

        Instant now = Instant.now();
        if (record.lockedUntil != null) {
            if (now.isBefore(record.lockedUntil)) {
                long remainingSeconds = Math.max(1, Duration.between(now, record.lockedUntil).getSeconds());
                throw new TooManyAttemptsException(
                        "Prea multe încercări eșuate pentru codul 2FA. Contul este blocat temporar. Încearcă din nou în "
                                + remainingSeconds + " secunde."
                );
            } else {
                attemptsByEmail.remove(key);
            }
        }
    }

    // Increments the failed attempts counter and locks the user after reaching maxAttempts.
    public void recordFailedAttempt(String email) {
        String key = normalizeKey(email);
        attemptsByEmail.compute(key, (k, existing) -> {
            Instant now = Instant.now();
            if (existing == null || (existing.lockedUntil != null && now.isAfter(existing.lockedUntil))) {
                existing = new AttemptRecord(0, null);
            }
            int updatedCount = existing.failedAttempts + 1;
            Instant lockedUntil = updatedCount >= maxAttempts ? now.plusSeconds(lockoutSeconds) : null;
            return new AttemptRecord(updatedCount, lockedUntil);
        });
    }

    // Clears failed attempt history after a valid 2FA verification.
    public void resetAttempts(String email) {
        attemptsByEmail.remove(normalizeKey(email));
    }

    // Returns remaining attempts before lockout.
    public int getRemainingAttempts(String email) {
        AttemptRecord record = attemptsByEmail.get(normalizeKey(email));
        if (record == null) {
            return maxAttempts;
        }
        return Math.max(0, maxAttempts - record.failedAttempts);
    }

    private String normalizeKey(String email) {
        return email == null ? "" : email.toLowerCase().trim();
    }

    private static class AttemptRecord {
        final int failedAttempts;
        final Instant lockedUntil;

        AttemptRecord(int failedAttempts, Instant lockedUntil) {
            this.failedAttempts = failedAttempts;
            this.lockedUntil = lockedUntil;
        }
    }
}
