package ro.gangstyle.api.exception;

// Exception thrown when a user exceeds the allowed number of 2FA verification attempts.
public class TooManyAttemptsException extends RuntimeException {

    public TooManyAttemptsException(String message) {
        super(message);
    }
}
